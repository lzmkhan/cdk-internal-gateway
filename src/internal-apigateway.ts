import { aws_apigateway as apigateway, aws_iam as iam } from "aws-cdk-lib";
import { IInterfaceVpcEndpoint } from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";

/**
 * Properties for ApiGateway
 */
export interface InternalApiGatewayProps {
  /**
   * Stage name  used for all cloudformation resource names and internal aws resource names.
   */
  readonly stage: string;

  /**
   * List of custom domains names to be used for the API Gateway.
   */
  readonly domains: apigateway.IDomainName[];

  /**
   * VPC endpoint id of execute-api vpc endpoint. This endpoint will be used to forward requests from the load balancer`s target group to the api gateway.
   */
  readonly vpcEndpoint: IInterfaceVpcEndpoint;

  /**
   * Path for custom domain base path mapping that will be attached to the api gateway
   */
  readonly apiBasePathMappingPath?: string;

  /**
   * Binary media types for the internal api gateway
   */
  readonly binaryMediaTypes?: string[] | undefined;

  /**
   * minimum compression size for the internal api gateway
   */
  readonly minimumCompressionSize?: number | undefined;
}

export abstract class InternalApiGateway extends Construct {
  /**
   * Internal API Gateway
   * This private api gateway is used to serve internal solutions (websites, apis, applications).
   * Attach your methods to this api gateway.
   * It is not exposed to the internet.
   * It is only accessible from the load balancer`s target group.
   */
  protected readonly apiGateway: apigateway.LambdaRestApi;
  constructor(scope: Construct, id: string, props: InternalApiGatewayProps) {
    super(scope, id);

    const apiResourcePolicy = new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.DENY,
          principals: [new iam.AnyPrincipal()],
          actions: ["execute-api:Invoke"],
          resources: ["execute-api:/*/*/*"],
          conditions: {
            StringNotEquals: {
              "aws:sourceVpce": props.vpcEndpoint.vpcEndpointId,
            },
          },
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          principals: [new iam.AnyPrincipal()],
          actions: ["execute-api:Invoke"],
          resources: ["execute-api:/*/*/*"],
          conditions: {
            StringEquals: {
              "aws:sourceVpce": props.vpcEndpoint.vpcEndpointId,
            },
          },
        }),
      ],
    });

    this.apiGateway = new apigateway.RestApi(this, `Gateway-${id}`, {
      description: "This service serves an internal api gateway",
      endpointConfiguration: {
        types: [apigateway.EndpointType.PRIVATE],
        vpcEndpoints: [props.vpcEndpoint],
      },
      policy: apiResourcePolicy,
      deployOptions: {
        stageName: props.stage,
      },
      binaryMediaTypes: props.binaryMediaTypes,
      minimumCompressionSize: props.minimumCompressionSize,
    });

    for (const domainItem of props.domains) {
      new apigateway.BasePathMapping(this, `-${domainItem}`, {
        domainName: domainItem,
        restApi: this.apiGateway,
        stage: this.apiGateway.deploymentStage,
        basePath: props.apiBasePathMappingPath
          ? props.apiBasePathMappingPath
          : "",
      });
    }
  }
}
