import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Bootstrapper } from './boostrapper';

export class BootstrapperStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const bootstrap_props = {
      CdkBootstrapRootQualifier: 'moecdk',
      CdkBootstrapRootRegions: ['ap-southeast-2'],
      BootStrapStacks: [
        {
          StackName: 'moe-admin-roles',
          Regions: ['ap-southeast-2']
        },   
      ]
    }

    new Bootstrapper(this, 'Bootstrapper', bootstrap_props )
  }
}
