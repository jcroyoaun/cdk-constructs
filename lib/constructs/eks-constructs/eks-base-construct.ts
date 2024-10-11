import * as cdk from 'aws-cdk-lib';
import { aws_eks as eks, aws_ec2 as ec2, aws_iam as iam, Tags } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { KubectlV30Layer } from '@aws-cdk/lambda-layer-kubectl-v30';

export class EksBaseConstruct extends Construct {
  public readonly cluster: eks.Cluster;
  constructor(scope: Construct, id: string, props: any, vpcRef: ec2.IVpc) {
    super(scope, id);


    const eksConfig = props.config;

    try {
      this.cluster = this.createCluster(vpcRef, eksConfig);
      this.createNodeGroup(this.cluster, eksConfig, props.env);
      this.grantAdminAccess(eksConfig);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Error creating EKS cluster: ${errorMessage}\nPlease check your EKS configuration in the YAML file.`);
    }
  }

  private createCluster(vpc: ec2.IVpc, eksConfig: any): eks.Cluster {
    const clusterRole = new iam.Role(this, 'EksClusterRole', {
      assumedBy: new iam.ServicePrincipal('eks.amazonaws.com'),
      roleName: `EKS-ClusterRole-${eksConfig.clusterName}`,
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
      authenticationMode: eks.AuthenticationMode.API,
    });
  }

  private createNodeGroup(cluster: eks.Cluster, eksConfig: any, envName: string) {
    const nodeRole = new iam.Role(this, 'EksNodeRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      roleName: `EKS-NodeRole-${eksConfig.clusterName}`,
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
    this.cluster.grantAccess('IAMAdminUser', 'arn:aws:iam::637423635181:user/iamadmin', [
      eks.AccessPolicy.fromAccessPolicyName('AmazonEKSClusterAdminPolicy', {
        accessScopeType: eks.AccessScopeType.CLUSTER,
      }),
    ]);
  }
}
