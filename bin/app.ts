import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { VpcConstruct } from '../lib/constructs/vpc-construct';
import { EksConstruct } from '../lib/constructs/eks-construct'
import { ConfigProvider } from '../lib/utils/config-loader';

const app = new cdk.App();

const env = app.node.tryGetContext('env');

if (!env) {
  throw new Error('Environment not specified. Use -c env=<environment>');
}

const configProvider = ConfigProvider.getInstance(env);
const config = configProvider.getConfig();

const awsEnv = { 
  account: config.aws_account, 
  region: config.aws_region
};

const stackMap: { [key: string]: new (scope: Construct, id: string, props: any) => Construct } = {
  vpc: VpcConstruct,
  eks: EksConstruct,
};

const createdStacks: { [key: string]: cdk.Stack } = {};

Object.keys(stackMap).forEach((key) => {
  if (config[key]) {
    const ConstructClass = stackMap[key];
    const stack = new cdk.Stack(app, `${env}-${key.charAt(0).toUpperCase() + key.slice(1)}Stack`, {
      env: awsEnv,
    });
    new ConstructClass(stack, `${key}Construct`, { env: env });
    createdStacks[key] = stack;
  }
});