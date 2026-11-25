export interface DeliveryOutcome {
    status: 'ACCEPTED' | 'DEFINITIVE_PRE_ACCEPT_FAILURE' | 'AMBIGUOUS_OUTCOME';
    provider_message_id?: string;
    error_details?: any;
}

export interface SendMessageRequest {
    to: string;
    subject: string;
    htmlBody: string;
    textBody?: string;
    
    logical_delivery_id: string;
    campaign_id: string;
    attempt_id: string;
}

export class AmazonSESAdapter {
    private client: any;
    private fromAddress: string;
    private configurationSet?: string;

    constructor(mockClient?: any) {
        if (!process.env.AWS_REGION || !process.env.SES_FROM_ADDRESS) {
            throw new Error("FATAL_CONFIG: Missing required SES environment variables");
        }

        this.fromAddress = process.env.SES_FROM_ADDRESS;
        this.configurationSet = process.env.SES_CONFIGURATION_SET;

        if (mockClient) {
            this.client = mockClient;
        } else {
            // No mock fallback!
            const { SESv2Client } = require('@aws-sdk/client-sesv2');
            this.client = new SESv2Client({ region: process.env.AWS_REGION });
        }
    }

    async sendAuthorizedMessage(req: SendMessageRequest): Promise<DeliveryOutcome> {
        try {
            // One logical delivery = exactly one SES recipient
            if (req.to.split(',').length > 1) {
                return {
                    status: 'DEFINITIVE_PRE_ACCEPT_FAILURE',
                    error_details: { message: 'Multi-recipient SES request blocked by Atlas invariant', code: 'InvariantViolation', statusCode: 400 }
                };
            }

            // Mapping to SES SendEmail request
            const params = {
                FromEmailAddress: this.fromAddress,
                Destination: {
                    ToAddresses: [req.to]
                },
                Content: {
                    Simple: {
                        Subject: { Data: req.subject },
                        Body: {
                            Html: { Data: req.htmlBody },
                            Text: req.textBody ? { Data: req.textBody } : undefined
                        }
                    }
                },
                ConfigurationSetName: this.configurationSet,
                EmailTags: [
                    { Name: 'atlas_delivery_id', Value: req.logical_delivery_id },
                    { Name: 'atlas_campaign_id', Value: req.campaign_id },
                    { Name: 'atlas_attempt_id', Value: req.attempt_id }
                ]
            };

            const command = { input: params }; // Mocking SES SendEmailCommand structure slightly for generic test mocking
            const response = await this.client.send(command);

            return {
                status: 'ACCEPTED',
                provider_message_id: response.MessageId
            };
        } catch (error: any) {
            // Determine if definitively pre-accept or ambiguous
            // SES throws specific exceptions for throttling, validation, etc.
            // Timeout / 500s are ambiguous. Validation / 400s are pre-accept.
            const statusCode = error.$metadata?.httpStatusCode;

            if (statusCode && statusCode >= 400 && statusCode < 500) {
                // Client error, definitively rejected by SES before sending
                return {
                    status: 'DEFINITIVE_PRE_ACCEPT_FAILURE',
                    error_details: { message: error.message, code: error.name, statusCode }
                };
            }

            if (error.name === 'TimeoutError' || error.name === 'ECONNRESET') {
                return {
                    status: 'AMBIGUOUS_OUTCOME',
                    error_details: { message: error.message, code: error.name }
                };
            }

            // Other network errors, timeouts, 500s
            return {
                status: 'AMBIGUOUS_OUTCOME',
                error_details: { message: error.message, code: error.name, statusCode }
            };
        }
    }
}
