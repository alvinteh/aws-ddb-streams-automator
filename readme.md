# dynamodb-streams-automator

This utility script helps create, enable or disable DynamoDB stream triggers (event source mappings in Lambda parlance) on multiple taples based on supplied arguments.

## Prerequisites

* AWS account
* node 14.16.0+
* IAM user/role with the following permissions to execute the script:
    * dynamodb:DescribeTable
    * dynamodb:ListTables
    * lambda:ListEventSourceMappings
    * lambda:CreateEventSourceMapping
    * lambda:UpdateEventSourceMapping

## Get Started

1. Clone this repository.
2. Install the node dependencies by running `npm install`.
3. Create your Lambda function and deploy it. Take note of its name.
4. Enable DynamoDB streams on each of your DynamoDB tables.
5. Run the `init` operation to create the event source mappings in the disabled state:
    node index.js -o init -r <aws_region> -b <batch_size> -f <lambda_function_name>
6. Run the `enable` operation to enable the event source mappings:
    node index.js -o enable -r <aws_region> -f <lambda_function_name>
7. Run the `disable` operation to enable the event source mappings:
    node index.js -o disable -r <aws_region>

## Remarks

* Take care when running this script as it does not exclude any tables or event source mappings from the various options.
* This script is best used when the Lambda trigger is reusable across multiple DynamoDB tables.
