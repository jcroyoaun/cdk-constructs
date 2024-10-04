import * as cdk from 'aws-cdk-lib';
import { aws_eks as eks, aws_ec2 as ec2, aws_iam as iam } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { logger } from '../../utils/logger';

export class EksAddonsConstruct extends Construct {
  constructor(scope: Construct, id: string, props: any, cluster: eks.Cluster, vpcRef: ec2.IVpc) {
    super(scope, id);
    
    const eksConfig = props.config;
    
    try {
      logger.info('Starting EKS add-ons installation', 'EksAddonsConstruct');
      this.installClusterAddOns(cluster, eksConfig, props.env);
      
      if (eksConfig.awsLoadBalancerController) {
        logger.info('Installing AWS Load Balancer Controller', 'EksAddonsConstruct');
        new AwsLbController(this, 'AwsLbController', eksConfig.awsLoadBalancerController, cluster, vpcRef);
      }
      
      if (eksConfig.ebsCsiDriver) {
        logger.info('Installing EBS CSI Driver', 'EksAddonsConstruct');
        new EbsCsiDriver(this, 'EbsCsiDriver', eksConfig.ebsCsiDriver, cluster, cluster.openIdConnectProvider);
      }
      
      if (eksConfig.metricsServer) {
        logger.info('Installing Metrics Server', 'EksAddonsConstruct');
        this.installMetricsServer(cluster, eksConfig.metricsServer);
      }
      
      logger.success('EKS add-ons installation completed successfully', 'EksAddonsConstruct');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Error setting up EKS addons: ${errorMessage}`, 'EksAddonsConstruct');
      throw new Error(`Error setting up EKS addons: ${errorMessage}\nPlease check your EKS addons configuration.`);
    }
  }

  private installClusterAddOns(cluster: eks.Cluster, eksConfig: any, envName: string) {
    const tags = [
      { key: 'Environment', value: envName },
      { key: 'Managed by', value: 'AWS CDK' },
      { key: 'Pod Name', value: 'Moscow' }
    ];
  
    if (eksConfig.addOns && Array.isArray(eksConfig.addOns)) {
      eksConfig.addOns.forEach((addon: any) => {
        if (!addon.name || !addon.version) {
          logger.warn(`Skipping invalid add-on configuration: ${JSON.stringify(addon)}`, 'EksAddonsConstruct');
          return;
        }
        logger.info(`Creating add-on: ${addon.name} with version ${addon.version}`, 'EksAddonsConstruct');
        new eks.CfnAddon(this, addon.name, {
          addonName: addon.name,
          clusterName: cluster.clusterName,
          addonVersion: addon.version,
          tags
        });
      });
    } else {
      logger.warn('No add-ons configuration found or invalid configuration', 'EksAddonsConstruct');
    }
  }

  private installMetricsServer(cluster: eks.Cluster, config: any) {
    try {
      logger.info(`Installing Metrics Server with config: ${JSON.stringify(config, null, 2)}`, 'EksAddonsConstruct');
      const valuesYaml = yaml.load(fs.readFileSync(path.join(__dirname, '..', '..', '..', 'values', 'metrics-server.yaml'), 'utf8')) as Record<string, any>;
      new eks.HelmChart(this, 'MetricsServerChart', {
        cluster,
        chart: 'metrics-server',
        repository: 'https://kubernetes-sigs.github.io/metrics-server/',
        namespace: config.namespace,
        release: 'metrics-server',
        version: config.version,
        values: valuesYaml,
      });
      logger.success('Metrics Server installed successfully', 'EksAddonsConstruct');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Error deploying Metrics Server: ${errorMessage}`, 'EksAddonsConstruct');
      throw new Error(`Error deploying Metrics Server: ${errorMessage}\nPlease check your Metrics Server configuration.`);
    }
  }
}

class AwsLbController extends Construct {
  constructor(scope: Construct, id: string, config: any, cluster: eks.Cluster, vpc: ec2.IVpc) {
    super(scope, id);

    try {
      logger.info('Starting AWS Load Balancer Controller installation', 'AwsLbController');
      
      const awsLbcRole = new iam.Role(this, 'AwsLbcRole', {
        assumedBy: new iam.ServicePrincipal('pods.eks.amazonaws.com'),
        roleName: `${cluster.clusterName}-aws-lbc`,
      });

      awsLbcRole.assumeRolePolicy?.addStatements(
        new iam.PolicyStatement({
          actions: ['sts:AssumeRole', 'sts:TagSession'],
          effect: iam.Effect.ALLOW,
          principals: [new iam.ServicePrincipal('pods.eks.amazonaws.com')],
        })
      );

      logger.info('Loading AWS Load Balancer Controller policy', 'AwsLbController');
      const policyJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '..', 'iam', 'AWSLoadBalancerController.json'), 'utf8'));
      const policyStatements = policyJson.Statement.map((statement: any) => iam.PolicyStatement.fromJson(statement));

      const awsLbcPolicy = new iam.Policy(this, 'AwsLbcPolicy', {
        statements: policyStatements,
      });
      awsLbcRole.attachInlinePolicy(awsLbcPolicy);

      logger.info('Creating Pod Identity Association', 'AwsLbController');
      new eks.CfnPodIdentityAssociation(this, 'AwsLbcPodIdentity', {
        clusterName: cluster.clusterName,
        namespace: config.namespace,
        serviceAccount: config.serviceAccountName,
        roleArn: awsLbcRole.roleArn,
      });

      logger.info('Deploying AWS Load Balancer Controller Helm Chart', 'AwsLbController');
      const awsLbcChart = new eks.HelmChart(this, 'AwsLbcChart', {
        cluster: cluster,
        repository: 'https://aws.github.io/eks-charts',
        chart: 'aws-load-balancer-controller',
        release: 'aws-load-balancer-controller',
        namespace: config.namespace,
        version: config.version,
        values: {
          clusterName: cluster.clusterName,
          serviceAccount: {
            name: config.serviceAccountName,
          },
          vpcId: vpc.vpcId,
        },
      });

      awsLbcChart.node.addDependency(awsLbcRole);

      logger.success('AWS Load Balancer Controller installed successfully', 'AwsLbController');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Error deploying AWS Load Balancer Controller: ${errorMessage}`, 'AwsLbController');
      throw new Error(`Error deploying AWS Load Balancer Controller: ${errorMessage}\nPlease check your AWS Load Balancer Controller configuration.`);
    }
  }
}

class EbsCsiDriver extends Construct {
  constructor(scope: Construct, id: string, config: any, cluster: eks.Cluster, oidcProvider: iam.IOpenIdConnectProvider) {
    super(scope, id);

    try {
      logger.info('Starting EBS CSI Driver installation', 'EbsCsiDriver');
      const ebsCsiRole = this.createEbsCsiRole(cluster, oidcProvider, config);
      this.attachEbsCsiPolicy(ebsCsiRole);
      this.deployEbsCsiDriver(cluster, config, ebsCsiRole);
      logger.success('EBS CSI Driver installed successfully', 'EbsCsiDriver');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Error deploying EBS CSI Driver: ${errorMessage}`, 'EbsCsiDriver');
      throw new Error(`Error deploying EBS CSI Driver: ${errorMessage}\nPlease check your EBS CSI Driver configuration.`);
    }
  }

  private createEbsCsiRole(cluster: eks.Cluster, oidcProvider: iam.IOpenIdConnectProvider, config: any): iam.Role {
    logger.info('Creating EBS CSI Driver IAM Role', 'EbsCsiDriver');
    const oidcProviderArn = oidcProvider.openIdConnectProviderArn;
    const oidcProviderIssuer = oidcProvider.openIdConnectProviderIssuer;

    const conditions = new cdk.CfnJson(this, 'ConditionJson', {
      value: {
        [`${oidcProviderIssuer}:aud`]: "sts.amazonaws.com",
        [`${oidcProviderIssuer}:sub`]: `system:serviceaccount:${config.namespace}:${config.serviceAccountName}`
      }
    });

    const ebsCsiRole = new iam.Role(this, 'EbsCsiRole', {
      assumedBy: new iam.WebIdentityPrincipal(oidcProviderArn, {
        StringEquals: conditions
      }),
      roleName: `${cluster.clusterName}-ebs-csi-driver`,
    });

    return ebsCsiRole;
  }

  private attachEbsCsiPolicy(role: iam.Role) {
    logger.info('Attaching EBS CSI Driver IAM Policy', 'EbsCsiDriver');
    role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonEBSCSIDriverPolicy'));
  }

  private deployEbsCsiDriver(cluster: eks.Cluster, config: any, role: iam.Role) {
    logger.info('Deploying EBS CSI Driver Helm Chart', 'EbsCsiDriver');
    const ebsCsiChart = new eks.HelmChart(this, 'EbsCsiChart', {
      cluster: cluster,
      repository: 'https://kubernetes-sigs.github.io/aws-ebs-csi-driver',
      chart: 'aws-ebs-csi-driver',
      release: 'aws-ebs-csi-driver',
      namespace: config.namespace,
      version: config.version,
      values: {
        controller: {
          serviceAccount: {
            create: true,
            name: config.serviceAccountName,
            annotations: {
              'eks.amazonaws.com/role-arn': role.roleArn
            }
          }
        }
      },
    });

    ebsCsiChart.node.addDependency(role);
  }
}