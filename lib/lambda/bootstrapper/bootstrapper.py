import boto3
import json
import os
import yaml

codebuild = boto3.client('codebuild')
ssm = boto3.client('ssm')

def on_event(event, context):

	CDK_BOOTSTRAP_QUALIFER = os.environ['CDK_BOOTSTRAP_QUALIFER']
	CDK_BOOTSTRAP_REGIONS = json.loads(os.environ['CDK_BOOTSTRAP_REGIONS'])
	CDK_APPS = json.loads(os.environ['CDK_APPS'])
	ROOT_ACCOUNT_ID = json.loads(os.environ['ROOT_ACCOUNT_ID'])
	CODEBUILD_PROJECT_NAME = os.environ['CODEBUILD_PROJECT_NAME']
	
	
	if 'source' in event.keys():
		if event['source'] == 'aws.events': # this was invoked by eventbridge
			account_name = event['detail']['serviceEventDetails']['createManagedAccountStatus']['account']['accountName']
			account_id = event['detail']['serviceEventDetails']['createManagedAccountStatus']['account']['accountId']

	else: # this was invoked by a test event
		account_id = event['accountId']
		account_name = event['account_name']
	
	# build the buildspec Bit
	# link packages, authenticate and set the iam alias
	build_commands = [
		f'export $(printf "AWS_ACCESS_KEY_ID=%s AWS_SECRET_ACCESS_KEY=%s AWS_SESSION_TOKEN=%s" \
		$(aws sts assume-role \
		--role-arn arn:aws:iam::{account_id}:role/AWSControlTowerExecution \
		--role-session-name MySessionName \
		--query "Credentials.[AccessKeyId,SecretAccessKey,SessionToken]" \
		--output text))',
		f'aws iam create-account-alias --account-alias {account_name} || echo Did not set Alias'
	]

	# commands to cdk bootstrap the account
	cdk_bootstrap_env = [
		'cd includelab',
		'npm update -g npm@latest',
		'npm install',
		# 'npm install -g aws-cdk-lib',
		# 'npm install -g typescript',
		# 'echo building project',
		# 'npm install --force',
		# 'tsc -v',
		'npx cdk bootstrap --show-template > lib/cfn/bootstrap-template.yaml'
	]
	cdk_bootstrap_env.append('npx cdk synth')
	for region in CDK_BOOTSTRAP_REGIONS:
		cdk_bootstrap_env.append(f'export AWS_DEFAULT_REGION={region}')
		cdk_bootstrap_env.append(f'aws cloudformation create-stack --stack-name CDKToolKit --template-body file://cdk.out/IncludelabStack.template.json --parameters \
				ParameterKey=TrustedAccounts,ParameterValue={ROOT_ACCOUNT_ID} \
				ParameterKey=CloudFormationExecutionPolicies,ParameterValue=arn:aws:iam::aws:policy/AdministratorAccess \
				ParameterKey=Qualifier,ParameterValue={CDK_BOOTSTRAP_QUALIFER} --capabilities=CAPABILITY_NAMED_IAM || \
			aws cloudformation update-stack --stack-name CDKToolKit --template-body file://cdk.out/IncludelabStack.template.json --parameters \
				ParameterKey=TrustedAccounts,ParameterValue={ROOT_ACCOUNT_ID} \
				ParameterKey=CloudFormationExecutionPolicies,ParameterValue=arn:aws:iam::aws:policy/AdministratorAccess \
				ParameterKey=Qualifier,ParameterValue={CDK_BOOTSTRAP_QUALIFER} --capabilities=CAPABILITY_NAMED_IAM && ')
	cdk_bootstrap_env.append('cd ..')
	cdk_bootstrap_env.append('echo Finished CDK Bootstrapping')
	print('bootstrap_cmds:', cdk_bootstrap_env)

	# create a string of commands to deploy cdk apps
	deploy_bootstrap_stacks = []
	for stack in CDK_APPS:
		for region in stack['Regions']:
			deploy_bootstrap_stacks.append(f'export AWS_DEFAULT_REGION={region}')	# swap the region if need be
			deploy_bootstrap_stacks.append(f'cd {stack["StackName"]}')	#cd to the stack
			deploy_bootstrap_stacks.append('npm install')	#cd to the stack
			deploy_bootstrap_stacks.append(f'npx cdk deploy --require-approval never') #deploy
			deploy_bootstrap_stacks.append('cd ..') #return to the top directory
	deploy_bootstrap_stacks.append('echo "Finished Deploying Boostrap Stacks')
	print('deploy_stacks_cmds:', deploy_bootstrap_stacks)
	
	buildspec = {
		'version': '0.2',
		'phases': {
			'install': {
				'runtime-versions': {
					'nodejs': 'latest'
				},
				'commands': []
			},
			'build': {
				'commands': build_commands + cdk_bootstrap_env #+ deploy_bootstrap_stacks
			},
			'post_build': {
				'commands': [
					'echo project built'
				]
			}
		},
		'artifacts': {
			'files': [
				'**/*',
				'dist/**/*',
				'package.json',
				'package-lock.json',
				'node_modules/**/*'
			]
		}
	}

	ssm.put_parameter(
		Name=f'/cdk-bootstrap/{CDK_BOOTSTRAP_QUALIFER}/version',
		Value='10',
		Type='String',
		Overwrite=True
	)
	
	codebuild.start_build(
		projectName = CODEBUILD_PROJECT_NAME,
		buildspecOverride = yaml.dump(buildspec)
	)
