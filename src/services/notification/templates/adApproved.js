export default function adApprovedTemplate(user, ad) {
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
    .button { display: inline-block; padding: 12px 24px; background: #4CAF50; color: white; text-decoration: none; border-radius: 4px; margin: 20px 0; }
    .stats { background: white; padding: 15px; border-radius: 4px; margin: 15px 0; }
    .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎉 Your Ad Has Been Approved!</h1>
    </div>
    <div class="content">
      <p>Hi ${user.firstName},</p>
      
      <p>Great news! Your ad "<strong>${ad.title}</strong>" has been approved and is now running.</p>
      
      <div class="stats">
        <h3>Campaign Details:</h3>
        <p><strong>Target Impressions:</strong> ${ad.targetImpressions.toLocaleString()}</p>
        <p><strong>Budget:</strong> $${parseFloat(ad.totalCost).toFixed(2)}</p>
        <p><strong>CPM:</strong> $${parseFloat(ad.finalCpm).toFixed(2)}</p>
      </div>
      
      <p>Your ad is now being distributed to relevant Telegram bots. You can track performance in real-time.</p>
      
      <a href="${process.env.FRONTEND_URL}/ads/${ad.id}" class="button">View Ad Performance</a>
      
      <p>Thank you for using AKHMADS.NET!</p>
      
      <p>Best regards,<br>The AKHMADS.NET Team</p>
    </div>
    <div class="footer">
      <p>AKHMADS.NET - Telegram Ad Distribution Platform</p>
      <p><a href="${process.env.FRONTEND_URL}">Visit Dashboard</a></p>
    </div>
  </div>
</body>
</html>
  `;
}