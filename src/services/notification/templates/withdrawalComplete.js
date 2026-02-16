export default function withdrawalCompleteTemplate(user, withdrawal) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #4CAF50; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
    .amount { font-size: 36px; color: #4CAF50; font-weight: bold; text-align: center; margin: 20px 0; }
    .details { background: white; padding: 15px; border-radius: 4px; margin: 15px 0; }
    .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>💰 Withdrawal Processed</h1>
    </div>
    <div class="content">
      <p>Hi ${user.firstName},</p>
      
      <p>Your withdrawal has been successfully processed!</p>
      
      <div class="amount">
        $${parseFloat(withdrawal.amount).toFixed(2)}
      </div>
      
      <div class="details">
        <h3>Transaction Details:</h3>
        <p><strong>Amount:</strong> $${parseFloat(withdrawal.amount).toFixed(2)}</p>
        <p><strong>Fee:</strong> $${parseFloat(withdrawal.fee).toFixed(2)}</p>
        <p><strong>Net Amount:</strong> $${parseFloat(withdrawal.netAmount).toFixed(2)}</p>
        <p><strong>Method:</strong> ${withdrawal.provider}</p>
        <p><strong>Status:</strong> ${withdrawal.status}</p>
        ${withdrawal.txHash ? `<p><strong>Transaction ID:</strong> ${withdrawal.txHash}</p>` : ''}
      </div>
      
      <p>The funds should arrive in your account within 1-3 business days depending on the payment method.</p>
      
      <p>Thank you for using AKHMADS.NET!</p>
      
      <p>Best regards,<br>The AKHMADS.NET Team</p>
    </div>
    <div class="footer">
      <p>AKHMADS.NET - Telegram Ad Distribution Platform</p>
      <p><a href="${process.env.FRONTEND_URL}/wallet">View Wallet</a></p>
    </div>
  </div>
</body>
</html>
  `;
}