import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { aws_rds as rds, aws_ec2 as ec2 } from 'aws-cdk-lib';
import { ConfigProvider } from '../utils/config-loader';

export interface RdsProps {
  env: string;
  vpc: ec2.IVpc;
  eksSecurityGroup: ec2.ISecurityGroup;
}

export class RdsConstruct extends Construct {
  public readonly cluster: rds.DatabaseCluster;
  public readonly securityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: RdsProps) {
    super(scope, id);

    const config = ConfigProvider.getInstance(props.env).getConfig();
    const rdsConfig = config.rds;

    if (!rdsConfig) {
      throw new Error('RDS configuration not found');
    }

    try {
      this.securityGroup = this.createSecurityGroup(props.vpc, rdsConfig, config.env);
      this.cluster = this.createDatabaseCluster(props.vpc, rdsConfig, config.env);
      this.configureSecurityGroup(props.eksSecurityGroup);
      this.addTags(rdsConfig, config.env);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Error creating RDS cluster: ${errorMessage}\nPlease check your RDS configuration in the YAML file.`);
    }
  }

  private createSecurityGroup(vpc: ec2.IVpc, rdsConfig: any, envName: string): ec2.SecurityGroup {
    const dbPrefix = rdsConfig.databasePrefix || 'instride';
    const dbName = rdsConfig.databaseName || 'drupal';

    return new ec2.SecurityGroup(this, `${dbPrefix}-${dbName}-${envName}-security-group`, {
      vpc,
      description: 'Allow access to Aurora RDS instance',
      allowAllOutbound: true,
    });
  }

  private createDatabaseCluster(vpc: ec2.IVpc, rdsConfig: any, envName: string): rds.DatabaseCluster {
    const writersInstanceClass = ec2.InstanceClass[rdsConfig.writerInstanceClass as keyof typeof ec2.InstanceClass];
    const writersInstanceSize = ec2.InstanceSize[rdsConfig.writerInstanceSize as keyof typeof ec2.InstanceSize];
    const readersInstanceClass = ec2.InstanceClass[rdsConfig.readersInstanceClass as keyof typeof ec2.InstanceClass];
    const readersInstanceSize = ec2.InstanceSize[rdsConfig.readersInstanceSize as keyof typeof ec2.InstanceSize];
    
    const dbPrefix = rdsConfig.databasePrefix || 'instride';
    const dbName = rdsConfig.databaseName || 'drupal';
    const databaseName = `${dbPrefix}${dbName}${envName}`;
    const sanitizedDatabaseName = /^[a-zA-Z]/.test(databaseName) ? databaseName : `instride${databaseName}`;

    return new rds.DatabaseCluster(this, `${dbPrefix}-${dbName}-${envName}`, {
      engine: rds.DatabaseClusterEngine.auroraMysql({ version: rds.AuroraMysqlEngineVersion.VER_3_05_2 }),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      writer: rds.ClusterInstance.provisioned('WriterInstance', {
        instanceType: ec2.InstanceType.of(writersInstanceClass, writersInstanceSize),
      }),
      readers: [
        rds.ClusterInstance.provisioned('ReaderInstance', {
          instanceType: ec2.InstanceType.of(readersInstanceClass, readersInstanceSize),
        })
      ],
      defaultDatabaseName: sanitizedDatabaseName,
      storageEncrypted: rdsConfig.storageEncrypted,
      backup: {
        retention: cdk.Duration.days(rdsConfig.backupRetentionDays),
        preferredWindow: rdsConfig.backupPreferredWindow,
      },
      removalPolicy: rdsConfig.removalPolicy === 'DESTROY' ? cdk.RemovalPolicy.DESTROY : cdk.RemovalPolicy.RETAIN,
      deletionProtection: rdsConfig.deletionProtection,
      securityGroups: [this.securityGroup],
    });
  }

  private configureSecurityGroup(eksSecurityGroup: ec2.ISecurityGroup) {
    this.securityGroup.addIngressRule(
      eksSecurityGroup,
      ec2.Port.tcp(3306),
      'Allow MySQL access from EKS'
    );
  }

  private addTags(rdsConfig: any, envName: string) {
    const dbPrefix = rdsConfig.databasePrefix || 'instride';
    const dbName = rdsConfig.databaseName || 'drupal';
    
    const tags = [
      { key: 'Name', value: `${dbPrefix}${dbName}${envName}` },
      { key: 'Environment', value: envName },
      { key: 'Managed By', value: 'AWS CDK' },
      { key: 'Pod Name', value: 'Moscow' },
    ];

    tags.forEach(tag => {
      cdk.Tags.of(this.cluster).add(tag.key, tag.value);
      cdk.Tags.of(this.securityGroup).add(tag.key, tag.value);
    });
  }
}