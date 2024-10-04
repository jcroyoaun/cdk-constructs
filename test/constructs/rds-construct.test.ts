import { Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { RdsConstruct } from '../../lib/constructs/rds-construct';

describe('RdsConstruct', () => {
  test('creates an RDS cluster with basic configuration', () => {
    const stack = new Stack();
    const vpc = new ec2.Vpc(stack, 'TestVpc');
    
    const props = {
      config: {
        databasePrefix: 'develop',
        databaseName: 'drupal',
        auroraEngineVersion: '8.0.mysql_aurora.3.05.2',
        writerInstanceClass: 'T3',
        writerInstanceSize: 'MEDIUM',
        backupRetentionDays: 7,
        backupPreferredWindow: '03:00-04:00',
        storageEncrypted: true,
        deletionProtection: false
      },
      env: 'develop',
      constructRefs: {
        vpc: { ec2Vpc: vpc },
        eks: { cluster: { clusterSecurityGroup: new ec2.SecurityGroup(stack, 'TestSG', { vpc }) } },
      },
    };

    new RdsConstruct(stack, 'TestRds', props);

    const template = Template.fromStack(stack);
    
    template.hasResourceProperties('AWS::RDS::DBCluster', {
      Engine: 'aurora-mysql',
      EngineVersion: '8.0.mysql_aurora.3.05.2',
      DatabaseName: 'developdrupaldevelop',
      BackupRetentionPeriod: 7,
      PreferredBackupWindow: '03:00-04:00',
      StorageEncrypted: true,
      DeletionProtection: false
    });

    template.hasResourceProperties('AWS::RDS::DBInstance', {
      DBInstanceClass: 'db.t3.medium',
      Engine: 'aurora-mysql',
    });
  });
});