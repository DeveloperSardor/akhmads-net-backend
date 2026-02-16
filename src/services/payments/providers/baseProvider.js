/**
 * Base Payment Provider
 * Abstract class for payment providers
 */
class BaseProvider {
  async initiateDeposit(data) {
    throw new Error('Not implemented');
  }

  async processWebhook(data) {
    throw new Error('Not implemented');
  }

  async verifySignature(data) {
    throw new Error('Not implemented');
  }
}

export default BaseProvider;