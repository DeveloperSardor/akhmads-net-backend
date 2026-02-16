export default function adRejectedTemplate(user, ad, reason) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #f44336; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
    .reason-box { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 15px 0; }
    .button { display: inline-block; padding: 12px 24px; background: #2196F3; color: white; text-decoration: none; border-radius: 4px; margin: 20px 0; }
    .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Ad Review Update</h1>
    </div>
    <div class="content">
      <p>Hi ${user.firstName},</p>
      
      <p>Your ad "<strong>${ad.title}</strong>" was reviewed and requires changes before it can run.</p>
      
      <div class="reason-box">
        <h3>Reason:</h3>
        <p>${reason}</p>
      </div>
      
      <p>Please review our <a href="${process.env.FRONTEND_URL}/guidelines">advertising guidelines</a> and make the necessary changes.</p>
      
      <p>You can edit your ad and resubmit it for review.</p>
      
      <a href="${process.env.FRONTEND_URL}/ads/${ad.id}/edit" class="button">Edit Ad</a>
      
      <p>If you have any questions, feel free to contact our support team.</p>
      
      <p>Best regards,<br>The AKHMADS.NET Team</p>
    </div>
    <div class="footer">
      <p>AKHMADS.NET - Telegram Ad Distribution Platform</p>
    </div>
  </div>
</body>
</html>
  `;
}