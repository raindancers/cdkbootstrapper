import * as cdk from 'aws-cdk-lib'
import * as constructs from 'constructs'
import * as path from 'path'

import {
  custom_resources as cr,
  aws_lambda as lambda,
  aws_iam as iam,
  aws_codebuild as codebuild,
  aws_s3_assets as s3assets,
  aws_events as events,
  aws_events_targets as targets,
  aws_sqs as sqs,
}
from 'aws-cdk-lib'

export interface BootstrapperProps {
	CdkBootstrapRootQualifier: string,		// what to qualify the cdkbootstrap with
	CdkBootstrapRootRegions: string[],		// what regions to boostrap
	BootStrapStacks: Array<{				// what stacks to deploy to the account
		StackName: string,
		Regions: string[]
	}>
} 

export class Bootstrapper extends constructs.Construct {
	public readonly serviceToken: string
  	public readonly projectName: string 
  
	constructor(scope: constructs.Construct, id: string, props: BootstrapperProps ) {
	  super(scope, id);
  

    // Create an asset for the Codebuild Job
    let codebuildAsset = new s3assets.Asset(this, 'codebuildAssets', {
      path: './bootstraptemplates'
    })

    // create the codebuild project that uses the asset
    let bootStrapperCodeBuild = new codebuild.Project(this, 'Codebuildproject', {
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_5_0,
        computeType: codebuild.ComputeType.MEDIUM
      },
      source: codebuild.Source.s3({     
        bucket: codebuildAsset.bucket,
        path: codebuildAsset.s3ObjectKey
      })
    })

    bootStrapperCodeBuild.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['sts:AssumeRole'],
        resources: ['arn:aws:iam::*:role/AWSControlTowerExecution'],
        effect: iam.Effect.ALLOW,
      })
    )

    // this is the lambda that processes the data and starts the codebuild project
    const bootStrapperLambda = new lambda.SingletonFunction(this, 'BootstrapLambda', {
    uuid: 'a7e4f740-4ff1-11e8-4c3d-fd7ae01bbebc',
    code: lambda.Code.fromAsset(path.join('lib/lambda/bootstrapper'),
    {
      bundling: { 
      image: lambda.Runtime.PYTHON_3_9.bundlingImage,
      command: [
      'bash', '-c',
      'pip install -r requirements.txt -t /asset-output && cp -au . /asset-output'
      ],
      },
    }),
    environment: {
      CDK_BOOTSTRAP_QUALIFER: props.CdkBootstrapRootQualifier,
      CDK_BOOTSTRAP_REGIONS: JSON.stringify(props.CdkBootstrapRootRegions),
      CDK_APPS: JSON.stringify(props.BootStrapStacks),
      ROOT_ACCOUNT_ID: cdk.Aws.ACCOUNT_ID,
      CODEBUILD_PROJECT_NAME:  bootStrapperCodeBuild.projectName,
    },


    handler: 'bootstrapper.on_event',
    timeout: cdk.Duration.seconds(300),
    runtime: lambda.Runtime.PYTHON_3_9
    });
    
    // allow it to find the AccountId
    bootStrapperLambda.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "organizations:ListAccounts",
          "organizations:DescribeAccount"
        ],
        resources: ['*']
      })
    )

    // allow it to start the code build job. 
    bootStrapperLambda.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "codebuild:StartBuild",
        ],
        resources: [bootStrapperCodeBuild.projectArn]
      })
    );

    //create a rule to trigger on new account creation
    const cTNewAccountRule = new events.Rule(this, 'ControlTowerEventRule', {
      eventPattern: {
        source: ['aws.controltower'],
        detail: {
          eventName: ['CreateManagedAccount']
        }
      }
    })

    const eventDLQ = new sqs.Queue(this, 'eventDLQ'); 

    cTNewAccountRule.addTarget(new targets.LambdaFunction(bootStrapperLambda, {
      deadLetterQueue: eventDLQ,
      maxEventAge: cdk.Duration.hours(2),
      retryAttempts: 2
    }));
  }
}

// {
//     "source": "aws.controltower",
//     "detail": {
//         "eventVersion": "1.05",
//         "eventName": "CreateManagedAccount",                  
//         "awsRegion": "us-east-1",                               
//         "sourceIPAddress": "AWS Internal",
//         "userAgent": "AWS Internal",
//         "eventID": "0000000-0000-0000-1111-123456789012",        
//         "readOnly": false,
//         "eventType": "AwsServiceEvent",
//         "serviceEventDetails": {
//             "createManagedAccountStatus": {
//                 "organizationalUnit":{
//                     "organizationalUnitName":"Custom",
//                     "organizationalUnitId":"ou-XXXX-l3zc8b3h"

//                     },
//                 "account":{
//                     "accountName":"LifeCycle1",
//                     "accountId":"XXXXXXXXXXXX"
//                     },
//                 "state":"SUCCEEDED",
//                 "message":"AWS Control Tower successfully created a managed account.",
//                 "requestedTimestamp":"2019-11-15T11:45:18+0000",
//                 "completedTimestamp":"2019-11-16T12:09:32+0000"}
//         }
//     }
// }