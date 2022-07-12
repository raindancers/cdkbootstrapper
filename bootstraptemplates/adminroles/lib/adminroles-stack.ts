import * as cdk from 'aws-cdk-lib';
import * as constructs from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';

export class AdminrolesStack extends cdk.Stack {
  constructor(scope: constructs.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const identity_account = '02xxxxxx61';

    // admin-readonly
    const admin_ro = new iam.Role(this, 'AdminRO',{
      roleName : 'moe-admin-ro',
      assumedBy: new iam.PrincipalWithConditions(new iam.AccountPrincipal(identity_account),
        {
          Bool: {
            'aws:MultiFactorAuthPresent': true,
          },
        }
     )
    });
    admin_ro.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('ReadOnlyAccess'));

    // admin-operations
    const admin_ops = new iam.Role(this, 'Billing',{
      roleName : 'moe-sysops',
      assumedBy: new iam.PrincipalWithConditions(new iam.AccountPrincipal(identity_account),
        {
          Bool: {
            'aws:MultiFactorAuthPresent': true,
          },
        }
     )
    });
    admin_ops.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('job-function/SystemAdministrator'));

    // admin-full
    const admin_full = new iam.Role(this, 'AdminFull',{
      roleName : 'moe-admin-full',  
      assumedBy: new iam.PrincipalWithConditions(new iam.AccountPrincipal(identity_account),
        {
          Bool: {
            'aws:MultiFactorAuthPresent': true,
          },
        }
      )
    });
    admin_full.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess'));
  }
}

