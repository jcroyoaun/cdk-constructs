import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { aws_rds as rds, aws_ec2 as ec2 } from 'aws-cdk-lib';
import { InstrideTagger } from '../utils/instride-tagging';

export class RdsConstruct extends Construct {
  public readonly cluster: rds.DatabaseCluster;
  public readonly securityGroup: ec2.SecurityGroup;
  private readonly dbPrefix: string;
  private readonly dbName: string;
  private readonly envName: string;

  constructor(scope: Construct, id: string, props: any) {
    super(scope, id);

    const rdsConfig = props.config;
    const vpcRef = props.constructRefs.vpc.ec2Vpc;
    const eksRef = props.constructRefs.eks.cluster;
    console.log(JSON.stringify(rdsConfig));
    this.dbPrefix = rdsConfig.databasePrefix || 'instride';
    this.dbName = rdsConfig.databaseName || 'drupal';
    this.envName = props.env;

    try {
      this.securityGroup = this.createSecurityGroup(vpcRef);
      this.cluster = this.createDatabaseCluster(vpcRef, rdsConfig);
      this.configureSecurityGroup(eksRef.clusterSecurityGroup);
      this.addTags(props);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Error creating RDS cluster: ${errorMessage}\nPlease check your RDS configuration in the YAML file.`);
    }
  }

  private createSecurityGroup(vpc: ec2.IVpc): ec2.SecurityGroup {
    return new ec2.SecurityGroup(this, `${this.dbPrefix}-${this.dbName}-${this.envName}-security-group`, {
      vpc,
      description: 'Allow access to Aurora RDS instance',
      allowAllOutbound: true,
    });
  }

  private createDatabaseCluster(vpc: ec2.IVpc, rdsConfig: any): rds.DatabaseCluster {
    const writersInstanceClass = ec2.InstanceClass[rdsConfig.writerInstanceClass as keyof typeof ec2.InstanceClass];
    const writersInstanceSize = ec2.InstanceSize[rdsConfig.writerInstanceSize as keyof typeof ec2.InstanceSize];
    const readersInstanceClass = ec2.InstanceClass[rdsConfig.readersInstanceClass as keyof typeof ec2.InstanceClass];
    const readersInstanceSize = ec2.InstanceSize[rdsConfig.readersInstanceSize as keyof typeof ec2.InstanceSize];
    
    const databaseName = `${this.dbPrefix}${this.dbName}${this.envName}`;
    const sanitizedDatabaseName = /^[a-zA-Z]/.test(databaseName) ? databaseName : `instride${databaseName}`;

    return new rds.DatabaseCluster(this, `${this.dbPrefix}-${this.dbName}-${this.envName}`, {
      engine: rds.DatabaseClusterEngine.auroraMysql({
        version: rds.AuroraMysqlEngineVersion.VER_3_05_2,
      }),
      vpc,
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

  private addTags(props: any) {
    const resourceName = `${this.dbPrefix}-${this.dbName}-${this.envName}`;
    InstrideTagger.tagResources([this.cluster, this.securityGroup], resourceName, props);
  }
}