const AWS = require('aws-sdk');
const { program } = require('commander');
const winston = require('winston');

// Constant for detecting if script is running as a Lambda function 
const IS_LAMBDA = !!process.env.LAMBDA_TASK_ROOT;

// Set up program options
program
    .requiredOption('-o, --operation <operation>', 'Operation to perform (init/enable/disable)', process.env.operation)
    .requiredOption('-r, --region <region>', 'AWS region)', process.env.region)
    .option('-b, --batch <batch_size>', 'Batch size)', process.env.batch || 5)
    .option('-f, --function <lambda_function_name>', 'Lambda function name)', process.env.function)
    .option('-l, --log <log_level>', 'Logging level (error/warn/info)', process.env.log || 'info');
program.parse(process.argv);

const options = program.opts();

// Set up logger
const logger = winston.createLogger({
    level: options.log,
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.combine(
                    winston.format.colorize({
                        all: true
                    }),
                    winston.format.timestamp({
                        format: 'YY-MM-DD HH:MM:SS'
                    }),
                    winston.format.printf(
                        info => ` ${info.timestamp} ${info.level}: ${info.message}`
                    )
                ),
            )
        })
    ],
});

AWS.config.update({ region: options.region });

// Create references to AWS services
const dynamodb = new AWS.DynamoDB();
const lambda = new AWS.Lambda();

// Define operation scripts
const scripts = {};

scripts.init = async () => {
    // Get tables
    const tableNames = await new Promise((resolve, reject) => {
        dynamodb.listTables({}).promise()
        .then((data) => {
            resolve(data.TableNames);
        })
        .catch((error) => {
            logger.error(`Failed to retrieve tables`);
            reject(error);
        });
    });

    // Get table stream ARNs
    const tablePromises = [];

    tableNames.forEach((tableName) => {
        const promise = new Promise((resolve, reject) => {
            dynamodb.describeTable({ TableName: tableName }).promise()
            .then((data) => {
                resolve({
                    name: tableName,
                    streamArn: data.Table.LatestStreamArn
                });
            })
            .catch((error) => {
                logger.error(`Failed to describe table ${tableName}`);
                reject(error);
            });
        });

        tablePromises.push(promise);
    });

    const tables = await Promise.all(tablePromises);

    // Add event source mappings
    const triggerPromises = [];

    tables.forEach((table) => {
        const promise = new Promise((resolve, reject) => {
            lambda.createEventSourceMapping(
                {
                    BatchSize: options.BatchSize,
                    Enabled: false,
                    EventSourceArn: table.streamArn, 
                    FunctionName: options.function,
                    StartingPosition: 'LATEST'
                },
                (error) => {
                    if (error) {
                        logger.error(`Failed to create trigger for ${table.name}`);
                        reject(error);
                    }
                    else {
                        logger.info(`Created trigger for ${table.name}`);
                        resolve(table);
                    }
                }
            );
        });

        triggerPromises.push(promise);
    });

    await Promise.all(triggerPromises);
    logger.info(`Completed creating triggers`);
};

scripts.enable = async() => {
    // Get event source mappings
    const eventSourceMappingUuids = await new Promise((resolve, reject) => {
        lambda.listEventSourceMappings({ FunctionName: options.function }).promise()
        .then((data) => {
            const eventSourceMappingUuids = data.EventSourceMappings.map((eventSourceMapping) => {
                return eventSourceMapping.UUID;

            });
            resolve(eventSourceMappingUuids);
        })
        .catch((error) => {
            logger.error(`Failed to retrieve event source mappings`);
            reject(error);
        });
    });

    // Update event source mappings
    const eventSourceMappingPromises = [];

    eventSourceMappingUuids.forEach((eventSourceMappingUuid) => {
        const promise = new Promise((resolve, reject) => {
            lambda.updateEventSourceMapping(
                {
                    Enabled: true, 
                    UUID: eventSourceMappingUuid
                }
            ).promise()
            .then((data) => {
                resolve(data.EventSourceMappings);
            })
            .catch((error) => {
                logger.error(`Failed to enable event source mapping ${eventSourceMappingUuid}`);
                reject(error);
            });
        });

        eventSourceMappingPromises.push(promise);
    });

    await Promise.all(eventSourceMappingPromises);
    logger.info(`Completed enabling triggers`);
};

scripts.disable = async() => {
    // Get event source mappings
    const eventSourceMappingUuids = await new Promise((resolve, reject) => {
        lambda.listEventSourceMappings({ FunctionName: options.function }).promise()
        .then((data) => {
            const eventSourceMappingUuids = data.EventSourceMappings.map((eventSourceMapping) => {
                return eventSourceMapping.UUID;

            });
            resolve(eventSourceMappingUuids);
        })
        .catch((error) => {
            logger.error(`Failed to retrieve event source mappings`);
            reject(error);
        });
    });

    // Update event source mappings
    const eventSourceMappingPromises = [];

    eventSourceMappingUuids.forEach((eventSourceMappingUuid) => {
        const promise = new Promise((resolve, reject) => {
            lambda.updateEventSourceMapping(
                {
                    Enabled: false, 
                    UUID: eventSourceMappingUuid
                }
            ).promise()
            .then((data) => {
                resolve(data.EventSourceMappings);
            })
            .catch((error) => {
                logger.error(`Failed to disable event source mapping ${eventSourceMappingUuid}`);
                reject(error);
            });
        });

        eventSourceMappingPromises.push(promise);
    });

    await Promise.all(eventSourceMappingPromises);
    logger.info(`Completed disabling triggers`);
};

// Define run function
const run = async (operation, excludedStreams) => {
    // Run appropriate script
    const script = scripts[operation];

    if (typeof script === 'function') {
        script(excludedStreams);
    }
    else {
        logger.error(`The specified operation (${operation}) is not valid.`);
    }
};

if (IS_LAMBDA) {
    module.exports.handler = async (event, context) => {
        return await run(event.operation, event.excludedStreams);
    };
}
else {
    run(options.operation, options.excludedStreams);
}