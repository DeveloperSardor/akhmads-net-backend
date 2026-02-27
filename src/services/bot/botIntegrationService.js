import logger from '../../utils/logger.js';

/**
 * Bot Integration Service
 * Generates integration code for different languages
 */
class BotIntegrationService {
  /**
   * Get integration code
   */
  getIntegrationCode(apiKey, language = 'python') {
    const codes = {
      python: this.getPythonCode(apiKey),
      javascript: this.getJavaScriptCode(apiKey),
      typescript: this.getTypeScriptCode(apiKey),
      php: this.getPhpCode(apiKey),
      csharp: this.getCSharpCode(apiKey),
    };

    return codes[language] || codes.python;
  }

  /**
   * Python integration code
   */
  getPythonCode(apiKey) {
    return `import aiohttp
import logging

logger = logging.getLogger(__name__)

class AkhmadsAdClient:
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = "https://akhmads.net/api/v1"
    
    async def show_ad(self, chat_id: int) -> dict:
        """
        Show ad to user
        
        Returns:
            dict with keys:
                - SendPostResult: int (0-6)
                - success: bool
        """
        async with aiohttp.ClientSession() as session:
            try:
                async with session.post(
                    f"{self.base_url}/ad/SendPost",
                    headers={
                        "Authorization": f"Bearer ${apiKey}",
                        "Content-Type": "application/json"
                    },
                    json={"SendToChatId": chat_id}
                ) as response:
                    if response.status == 200:
                        data = await response.json()
                        return {
                            "SendPostResult": data.get("SendPostResult", 0),
                            "success": data.get("SendPostResult") == 1
                        }
                    else:
                        logger.error(f"Ad API error: {response.status}")
                        return {"SendPostResult": 6, "success": False}
            except Exception as e:
                logger.error(f"Failed to show ad: {e}")
                return {"SendPostResult": 6, "success": False}

# Usage example:
# ad_client = AkhmadsAdClient("${apiKey}")
# result = await ad_client.show_ad(user_id)
# if result["success"]:
#     print("Ad shown successfully")`;
  }

  /**
   * JavaScript integration code
   */
  getJavaScriptCode(apiKey) {
    return `const axios = require('axios');

class AkhmadsAdClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://akhmads.net/api/v1';
  }

  async showAd(chatId) {
    try {
      const response = await axios.post(
        \`\${this.baseUrl}/ad/SendPost\`,
        { SendToChatId: chatId },
        {
          headers: {
            'Authorization': \`Bearer ${apiKey}\`,
            'Content-Type': 'application/json'
          }
        }
      );

      return {
        SendPostResult: response.data.SendPostResult || 0,
        success: response.data.SendPostResult === 1
      };
    } catch (error) {
      console.error('Failed to show ad:', error.message);
      return { SendPostResult: 6, success: false };
    }
  }
}

// Usage:
// const adClient = new AkhmadsAdClient('${apiKey}');
// const result = await adClient.showAd(userId);
// if (result.success) {
//   console.log('Ad shown successfully');
// }

module.exports = AkhmadsAdClient;`;
  }

  /**
   * TypeScript integration code
   */
  getTypeScriptCode(apiKey) {
    return `import axios, { AxiosResponse } from 'axios';

interface AdResponse {
  SendPostResult: number;
  success: boolean;
}

class AkhmadsAdClient {
  private apiKey: string;
  private baseUrl: string = 'https://akhmads.net/api/v1';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async showAd(chatId: number): Promise<AdResponse> {
    try {
      const response: AxiosResponse = await axios.post(
        \`\${this.baseUrl}/ad/SendPost\`,
        { SendToChatId: chatId },
        {
          headers: {
            'Authorization': \`Bearer ${apiKey}\`,
            'Content-Type': 'application/json'
          }
        }
      );

      return {
        SendPostResult: response.data.SendPostResult || 0,
        success: response.data.SendPostResult === 1
      };
    } catch (error) {
      console.error('Failed to show ad:', error);
      return { SendPostResult: 6, success: false };
    }
  }
}

export default AkhmadsAdClient;

// Usage:
// const adClient = new AkhmadsAdClient('${apiKey}');
// const result = await adClient.showAd(userId);`;
  }

  /**
   * PHP integration code
   */
  getPhpCode(apiKey) {
    return `<?php

class AkhmadsAdClient {
    private $apiKey;
    private $baseUrl = 'https://akhmads.net/api/v1';

    public function __construct($apiKey) {
        $this->apiKey = $apiKey;
    }

    public function showAd($chatId) {
        $ch = curl_init($this->baseUrl . '/ad/SendPost');
        
        curl_setopt($ch, CURLOPT_POST, 1);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode([
            'SendToChatId' => $chatId
        ]));
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Content-Type: application/json',
            'Authorization: Bearer ${apiKey}'
        ]);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        
        if ($httpCode === 200) {
            $data = json_decode($response, true);
            return [
                'SendPostResult' => $data['SendPostResult'] ?? 0,
                'success' => ($data['SendPostResult'] ?? 0) === 1
            ];
        }
        
        return ['SendPostResult' => 6, 'success' => false];
    }
}

// Usage:
// $adClient = new AkhmadsAdClient('${apiKey}');
// $result = $adClient->showAd($userId);
// if ($result['success']) {
//     echo "Ad shown successfully";
// }

?>`;
  }

  /**
   * C# integration code
   */
  getCSharpCode(apiKey) {
    return `using System;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;

public class AkhmadsAdClient
{
    private readonly string _apiKey;
    private readonly HttpClient _httpClient;
    private const string BaseUrl = "https://akhmads.net/api/v1";

    public AkhmadsAdClient(string apiKey)
    {
        _apiKey = apiKey;
        _httpClient = new HttpClient();
        _httpClient.DefaultRequestHeaders.Add("Authorization", $"Bearer ${apiKey}");
    }

    public async Task<AdResponse> ShowAdAsync(long chatId)
    {
        try
        {
            var content = new StringContent(
                JsonSerializer.Serialize(new { SendToChatId = chatId }),
                Encoding.UTF8,
                "application/json"
            );

            var response = await _httpClient.PostAsync($"{BaseUrl}/ad/SendPost", content);
            
            if (response.IsSuccessStatusCode)
            {
                var json = await response.Content.ReadAsStringAsync();
                var data = JsonSerializer.Deserialize<JsonElement>(json);
                var result = data.GetProperty("SendPostResult").GetInt32();
                
                return new AdResponse
                {
                    SendPostResult = result,
                    Success = result == 1
                };
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Failed to show ad: {ex.Message}");
        }

        return new AdResponse { SendPostResult = 6, Success = false };
    }

    public class AdResponse
    {
        public int SendPostResult { get; set; }
        public bool Success { get; set; }
    }
}

// Usage:
// var adClient = new AkhmadsAdClient("${apiKey}");
// var result = await adClient.ShowAdAsync(userId);
// if (result.Success) {
//     Console.WriteLine("Ad shown successfully");
// }`;
  }

  /**
   * Get documentation
   */
  getDocumentation() {
    return {
      endpoint: 'POST https://akhmads.net/api/v1/ad/SendPost',
      authentication: 'Bearer token in Authorization header',
      requestBody: {
        SendToChatId: 'number - Telegram chat ID',
      },
      response: {
        SendPostResult: 'number - Result code (0-6)',
        codes: {
          0: 'No ads available',
          1: 'Success',
          2: 'Revoked token error',
          3: 'User blocked bot',
          4: 'Too many requests',
          5: 'Bot API error',
          6: 'Other error',
        },
      },
    };
  }
}

const botIntegrationService = new BotIntegrationService();
export default botIntegrationService;