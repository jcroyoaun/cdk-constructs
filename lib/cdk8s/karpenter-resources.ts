import { Construct } from 'constructs';
import { ApiObject, Chart } from 'cdk8s'

export class EC2NodeClass extends Chart {
  constructor(scope: Construct, id: string, props: { clusterName: string, nodeRoleName: string }) {
    super(scope, id);

    new ApiObject(this, 'EC2NodeClass', {
      apiVersion: 'karpenter.k8s.aws/v1',
      kind: 'EC2NodeClass',
      metadata: { name: 'default' },
      spec: {
        amiFamily: 'AL2',
        metadataOptions: {
          httpEndpoint: 'enabled',
          httpProtocolIPv6: 'disabled',
          httpPutResponseHopLimit: 2,
          httpTokens: 'required',
        },
        role: props.nodeRoleName,
        securityGroupSelectorTerms: [{ tags: { 'karpenter.sh/discovery': props.clusterName } }],
        subnetSelectorTerms: [{ tags: { 'karpenter.sh/discovery': props.clusterName } }],
      },
    });
  }
}

export class NodePool extends Chart {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    new ApiObject(this, 'NodePool', {
      apiVersion: 'karpenter.sh/v1',
      kind: 'NodePool',
      metadata: { name: 'default' },
      spec: {
        disruption: {
          budgets: [{ nodes: '10%' }],
          consolidationPolicy: 'WhenEmptyOrUnderutilized',
          expireAfter: '720h',
        },
        limits: {
          cpu: 60,
          memory: '160Gi',
        },
        template: {
          spec: {
            nodeClassRef: {
              apiVersion: 'karpenter.k8s.aws/v1',
              kind: 'EC2NodeClass',
              name: 'default',
            },
            requirements: [
              { key: 'kubernetes.io/arch', operator: 'In', values: ['amd64'] },
              { key: 'kubernetes.io/os', operator: 'In', values: ['linux'] },
              { key: 'karpenter.sh/capacity-type', operator: 'In', values: ['spot'] },
              { key: 'karpenter.k8s.aws/instance-category', operator: 'In', values: ['c', 'm', 'r'] },
              { key: 'karpenter.k8s.aws/instance-generation', operator: 'Gt', values: ['2'] },
              { key: 'karpenter.k8s.aws/instance-size', operator: 'In', values: ['small', 'medium', 'large', 'xlarge', '2xlarge'] },
            ],
          },
        },
      },
    });
  }
}
