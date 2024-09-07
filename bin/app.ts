#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { NetworkStack } from '../lib/stacks/network-stack';
import { ConfigProvider } from '../lib/utils/config-loader';

const app = new cdk.App();

const configEnv = app.node.tryGetContext('env') || 'dev';

// Initialize the ConfigProvider with the environment
const configProvider = ConfigProvider.getInstance(configEnv);
const config = configProvider.getConfig();

// Get the AWS account and region from the config
const awsAccount = config.aws_account;
const awsRegion = config.aws_region;

// Create the NetworkStack with the correct props and environment
new NetworkStack(app, `NetworkStack-${configEnv}`, { 
  env: {
    account: awsAccount,
    region: awsRegion
  },
  configEnv: configEnv
});

app.synth();