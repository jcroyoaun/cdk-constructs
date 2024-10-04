import { SubnetNamingUtil } from '../../lib/utils/subnet-naming-util';

describe('SubnetNamingUtil', () => {
  test('getSubnetName returns correct name', () => {
    const vpcName = 'test-vpc';
    const subnetType = 'public';
    const index = 0;

    const result = SubnetNamingUtil.getSubnetName(vpcName, subnetType, index);

    expect(result).toBe('test-vpc-public-a');
  });

  test('getVpcName returns correct name', () => {
    const vpcName = 'test-vpc';

    const result = SubnetNamingUtil.getVpcName(vpcName);

    expect(result).toBe('test-vpc');
  });
});
