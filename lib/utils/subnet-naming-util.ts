export class SubnetNamingUtil {
  static getSubnetName(vpcName: string, subnetType: string, index: number): string {
    const letter = String.fromCharCode(97 + index);
    return `${vpcName}-${subnetType}-${letter}`;
  }

  static getVpcName(vpcName: string): string {
    return vpcName;
  }
}