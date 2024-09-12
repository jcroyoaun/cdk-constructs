import * as cdk from 'aws-cdk-lib';
import { aws_eks as eks, aws_ec2 as ec2, aws_iam as iam } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { KubectlV30Layer } from '@aws-cdk/lambda-layer-kubectl-v30';
import { ConfigProvider } from '../utils/config-loader';
import * as fs from 'fs';
import * as path from 'path';

export interface EksConstructProps {
  env: string;
  vpc: ec2.IVpc;
}

export class EksConstruct extends Construct {
  public readonly cluster: eks.Cluster;

  constructor(scope: Construct, id: string, props: EksConstructProps) {
    super(scope, id);

    const config = ConfigProvider.getInstance(props.env).getConfig();
    const eksConfig = config.eks;

    if (!eksConfig) {
      throw new Error('EKS configuration not found');
    }

    try {
      this.cluster = this.createCluster(props.vpc, eksConfig);
      this.createNodeGroup(this.cluster, eksConfig, props.env);
      this.installClusterAddOns(this.cluster, eksConfig, props.env);
      this.grantAdminAccess(eksConfig);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Error creating EKS cluster: ${errorMessage}\nPlease check your EKS configuration in the YAML file.`);
    }
  }

  private createCluster(vpc: ec2.IVpc, eksConfig: any): eks.Cluster {
    const clusterRole = new iam.Role(this, 'EksClusterRole', {
      assumedBy: new iam.ServicePrincipal('eks.amazonaws.com'),
      roleName: `${eksConfig.clusterName}-eks-cluster`,
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKSClusterPolicy'),
      ],
    });

    return new eks.Cluster(this, eksConfig.clusterName, {
      version: eks.KubernetesVersion.of(eksConfig.version),
      vpc,
      vpcSubnets: [{ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }],
      role: clusterRole,
      kubectlLayer: new KubectlV30Layer(this, 'kubectl'),
      clusterName: eksConfig.clusterName,
      defaultCapacity: 0,
      endpointAccess: eks.EndpointAccess.PUBLIC_AND_PRIVATE,
      authenticationMode: eks.AuthenticationMode.API
    });
  }

  private createNodeGroup(cluster: eks.Cluster, eksConfig: any, envName: string) {
    const nodeRole = new iam.Role(this, 'EksNodeRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      roleName: `${eksConfig.clusterName}-eks-nodes`,
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKSWorkerNodePolicy'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKS_CNI_Policy'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEC2ContainerRegistryReadOnly'),
      ],
    });

    cluster.addNodegroupCapacity(envName, {
      instanceTypes: eksConfig.NodeGroup.instanceTypes.map((type: string) => ec2.InstanceType.of(
        ec2.InstanceClass[type.split('.')[0].toUpperCase() as keyof typeof ec2.InstanceClass],
        ec2.InstanceSize[type.split('.')[1].toUpperCase() as keyof typeof ec2.InstanceSize]
      )),
      minSize: eksConfig.NodeGroup.minCapacity,
      maxSize: eksConfig.NodeGroup.maxCapacity,
      desiredSize: eksConfig.NodeGroup.desiredCapacity,
      diskSize: eksConfig.NodeGroup.diskSize,
      nodeRole: nodeRole,
      subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      capacityType: eksConfig.NodeGroup.capacityType.toUpperCase() === 'SPOT' 
        ? eks.CapacityType.SPOT 
        : eks.CapacityType.ON_DEMAND,
      labels: { role: envName },
    });
  }

  private grantAdminAccess(eksConfig: any) {
    this.cluster.grantAccess('SSOAdminAccess', eksConfig.adminAccess.roleArnPrefix, [
      eks.AccessPolicy.fromAccessPolicyName('AmazonEKSClusterAdminPolicy', {
        accessScopeType: eks.AccessScopeType.CLUSTER,
      }),
    ]);
  }

  private installClusterAddOns(cluster: eks.Cluster, eksConfig: any, envName: string) {
    const tags = [
      { key: 'Environment:', value: envName },
      { key: 'Managed by:', value: 'AWS CDK' },
      { key: 'Pod Name:', value: 'Moscow' }
    ];

    const addons = [
      { name: 'coredns', id: 'CoreDNS' },
      { name: 'vpc-cni', id: 'VPC-CNI' },
      { name: 'kube-proxy', id: 'Kube-proxy' },
      { name: 'eks-pod-identity-agent', id: 'Pod-Identity' },
      { name: 'kubecost_kubecost', id: 'Kubecost', version: 'v2.1.0-eksbuild.1' }
    ];

    addons.forEach(addon => {
      new eks.CfnAddon(this, addon.id, {
        addonName: addon.name,
        clusterName: cluster.clusterName,
        addonVersion: addon.version,
        tags
      });
    });
  }
}

interface AwsLbControllerProps {
  cluster: eks.Cluster;
  vpc: ec2.IVpc;
  config: any;
}

class AwsLbController extends Construct {
  constructor(scope: Construct, id: string, props: AwsLbControllerProps) {
    super(scope, id);

    const { cluster, vpc, config } = props;

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

      // Load the policy JSON
      const policyJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'iam', 'AWSLoadBalancerController.json'), 'utf8'));
      
      // Create policy statements from the JSON
      const policyStatements = policyJson.Statement.map((statement: any) => iam.PolicyStatement.fromJson(statement));

      const awsLbcPolicy = new iam.Policy(this, 'AwsLbcPolicy', {
        statements: policyStatements,
      });
      awsLbcRole.attachInlinePolicy(awsLbcPolicy);

      new eks.CfnPodIdentityAssociation(this, 'AwsLbcPodIdentity', {
        clusterName: cluster.clusterName,
        namespace: config.awsLoadBalancerController.namespace,
        serviceAccount: config.awsLoadBalancerController.serviceAccountName,
        roleArn: awsLbcRole.roleArn,
      });

      const awsLbcChart = new eks.HelmChart(this, 'AwsLbcChart', {
        cluster: cluster,
        repository: 'https://aws.github.io/eks-charts',
        chart: 'aws-load-balancer-controller',
        release: 'aws-load-balancer-controller',
        namespace: config.awsLoadBalancerController.namespace,
        version: config.awsLoadBalancerController.version,
        values: {
          clusterName: cluster.clusterName,
          serviceAccount: {
            name: config.awsLoadBalancerController.serviceAccountName,
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

interface EbsCsiDriverProps {
  cluster: eks.Cluster;
  config: any;
  oidcProvider: eks.OpenIdConnectProvider;
}

class EbsCsiDriver extends Construct {
  constructor(scope: Construct, id: string, props: EbsCsiDriverProps) {
    super(scope, id);

    const { cluster, config, oidcProvider } = props;

    const ebsCsiRole = this.createEbsCsiRole(cluster, oidcProvider, config);
    this.attachEbsCsiPolicy(ebsCsiRole);
    this.deployEbsCsiDriver(cluster, config, ebsCsiRole);
  }

  private createEbsCsiRole(cluster: eks.Cluster, oidcProvider: eks.OpenIdConnectProvider, config: any): iam.Role {
    const ebsCsiRole = new iam.Role(this, 'EbsCsiRole', {
      assumedBy: new iam.WebIdentityPrincipal(oidcProvider.openIdConnectProviderArn, {
        "StringEquals": {
          [`${oidcProvider.openIdConnectProviderIssuer}:aud`]: "sts.amazonaws.com",
          [`${oidcProvider.openIdConnectProviderIssuer}:sub`]: `system:serviceaccount:${config.ebsCsiDriver.namespace}:${config.ebsCsiDriver.serviceAccountName}`
        }
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
      namespace: config.ebsCsiDriver.namespace,
      version: config.ebsCsiDriver.version,
      values: {
        controller: {
          serviceAccount: {
            create: true,
            name: config.ebsCsiDriver.serviceAccountName,
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