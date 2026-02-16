export default function botApprovedTemplate(user, bot) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #2196F3; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
    .api-key { background: #e8f5e9; padding: 15px; border-radius: 4px; font-family: monospace; margin: 15px 0; }
    .button { display: inline-block; padding: 12px 24px; background: #4CAF50; color: white; text-decoration: none; border-radius: 4px; margin: 20px 0; }
    .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🤖 Your Bot Has Been Approved!</h1>
    </div>
    <div class="content">
      <p>Hi ${user.firstName},</p>
      
      <p>Congratulations! Your bot <strong>@${bot.username}</strong> has been approved and is now active.</p>
      
      <h3>Next Steps:</h3>
      <ol>
        <li>Get your API key from the dashboard</li>
        <li>Integrate the ad distribution code into your bot</li>
        <li>Start earning money from ad impressions!</li>
      </ol>
      
      <p>Your bot will now start receiving ads based on your settings. You'll earn revenue for every ad shown to your users.</p>
      
      <a href="${process.env.FRONTEND_URL}/bots/${bot.id}" class="button">View Bot Dashboard</a>
      
      <p>Ready to start monetizing? Check out our <a href="${process.env.FRONTEND_URL}/docs/integration">integration guide</a>.</p>
      
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