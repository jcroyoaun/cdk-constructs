import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { VpcConstruct } from '../constructs/vpc-construct';
import { ConfigProvider } from '../utils/config-loader';

interface NetworkStackProps extends cdk.StackProps {
  configEnv: string;
}

export class NetworkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: NetworkStackProps) {
    super(scope, id, props);

    const config = ConfigProvider.getInstance(props.configEnv).getConfig();

    new VpcConstruct(this, 'MainVPC', { env: props.configEnv });
  }
}