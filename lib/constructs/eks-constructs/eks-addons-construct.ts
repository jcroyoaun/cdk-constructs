import * as cdk from 'aws-cdk-lib';
import { aws_eks as eks, aws_ec2 as ec2, aws_iam as iam } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

export class EksAddonsConstruct extends Construct {
  constructor(scope: Construct, id: string, props: any, cluster: eks.Cluster, vpcRef: ec2.IVpc) {
    super(scope, id);
    
    const eksConfig = props.config;
    
    try {
      this.installClusterAddOns(cluster, eksConfig, props.env);
      
      if (eksConfig.awsLoadBalancerController) {
        new AwsLbController(this, 'AwsLbController', eksConfig.awsLoadBalancerController, cluster, vpcRef);
      }
      
      if (eksConfig.ebsCsiDriver) {
        new EbsCsiDriver(this, 'EbsCsiDriver', eksConfig.ebsCsiDriver, cluster, cluster.openIdConnectProvider);
      }
      
      if (eksConfig.metricsServer) {
        this.installMetricsServer(cluster, eksConfig.metricsServer);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
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
          console.warn(`Skipping invalid add-on configuration: ${JSON.stringify(addon)}`);
          return;
        }
        console.log(`Creating add-on: ${addon.name} with version ${addon.version}`);
        new eks.CfnAddon(this, addon.name, {
          addonName: addon.name,
          clusterName: cluster.clusterName,
          addonVersion: addon.version,
          tags
        });
      });
    } else {
      console.warn('No add-ons configuration found or invalid configuration');
    }
  }

  private installMetricsServer(cluster: eks.Cluster, config: any) {
    try {
      console.log('Installing Metrics Server with config:', JSON.stringify(config, null, 2));
      const valuesYaml = yaml.load(fs.readFileSync(path.join(__dirname, '..', '..', '..', 'values', 'metrics-server.yaml'), 'utf8')) as Record<string, any>;
      console.log(JSON.stringify(valuesYaml));
      new eks.HelmChart(this, 'MetricsServerChart', {
        cluster,
        chart: 'metrics-server',
        repository: 'https://kubernetes-sigs.github.io/metrics-server/',
        namespace: config.namespace,
        release: 'metrics-server',
        version: config.version,
        values: valuesYaml,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Error deploying Metrics Server: ${errorMessage}\nPlease check your Metrics Server configuration.`);
    }
  }
}

class AwsLbController extends Construct {
  constructor(scope: Construct, id: string, config: any, cluster: eks.Cluster, vpc: ec2.IVpc) {
    super(scope, id);

    try {
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

      const policyJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '..', 'iam', 'AWSLoadBalancerController.json'), 'utf8'));
      const policyStatements = policyJson.Statement.map((statement: any) => iam.PolicyStatement.fromJson(statement));

      const awsLbcPolicy = new iam.Policy(this, 'AwsLbcPolicy', {
        statements: policyStatements,
      });
      awsLbcRole.attachInlinePolicy(awsLbcPolicy);

      new eks.CfnPodIdentityAssociation(this, 'AwsLbcPodIdentity', {
        clusterName: cluster.clusterName,
        namespace: config.namespace,
        serviceAccount: config.serviceAccountName,
        roleArn: awsLbcRole.roleArn,
      });

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

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Error deploying AWS Load Balancer Controller: ${errorMessage}\nPlease check your AWS Load Balancer Controller configuration.`);
    }
  }
}

class EbsCsiDriver extends Construct {
  constructor(scope: Construct, id: string, config: any, cluster: eks.Cluster, oidcProvider: iam.IOpenIdConnectProvider) {
    super(scope, id);

    try {
      const ebsCsiRole = this.createEbsCsiRole(cluster, oidcProvider, config);
      this.attachEbsCsiPolicy(ebsCsiRole);
      this.deployEbsCsiDriver(cluster, config, ebsCsiRole);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Error deploying EBS CSI Driver: ${errorMessage}\nPlease check your EBS CSI Driver configuration.`);
    }
  }

  private createEbsCsiRole(cluster: eks.Cluster, oidcProvider: iam.IOpenIdConnectProvider, config: any): iam.Role {
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
    role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonEBSCSIDriverPolicy'));
  }

  private deployEbsCsiDriver(cluster: eks.Cluster, config: any, role: iam.Role) {
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
