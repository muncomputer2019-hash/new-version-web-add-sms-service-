export interface Fast2SmsSendResult {
  sent: boolean;
  providerConfigured: boolean;
  sandboxMode: boolean;
  sandboxOtpPreview?: string;
  detail: string;
}

function normalizeIndianMobile(rawMobile: string): string {
  const digits = rawMobile.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits.slice(2);
  }
  if (digits.length === 13 && digits.startsWith('880')) {
    return digits.slice(3);
  }
  if (digits.length > 10) {
    return digits.slice(-10);
  }
  return digits;
}

function resolveFast2SmsApiKey(): string {
  return (process.env.FAST2SMS_API_KEY || process.env.SMS_API_KEY || '').trim();
}

export function isFast2SmsConfigured(): boolean {
  return Boolean(resolveFast2SmsApiKey());
}

export function isSandboxOtpAllowed(): boolean {
  return (
    process.env.NODE_ENV !== 'production' ||
    process.env.ALLOW_SANDBOX_OTP === 'true'
  );
}

/**
 * Server-side Fast2SMS OTP Dispatcher (https://www.fast2sms.com/dev/bulkV2).
 * Supports 'dlt' (Sender ID + DLT Template ID), 'otp' (Quick OTP route), and 'q' (Quick SMS).
 * In strict production (NODE_ENV=production and ALLOW_SANDBOX_OTP!==true):
 * - NEVER fakes OTP success when FAST2SMS_API_KEY is missing or API returns error.
 * - NEVER leaks OTP values or API keys in response payloads, URLs, or logs.
 */
export async function sendFast2SmsOtp(params: {
  mobile: string;
  otp: string;
  userId?: string;
}): Promise<Fast2SmsSendResult> {
  const apiKey = resolveFast2SmsApiKey();
  const templateId = (process.env.FAST2SMS_TEMPLATE_ID || '').trim();
  const route = (
    process.env.FAST2SMS_ROUTE ||
    (templateId ? 'dlt' : 'otp')
  )
    .trim()
    .toLowerCase();
  const senderId = (
    process.env.FAST2SMS_SENDER_ID ||
    process.env.SMS_SENDER_ID ||
    'MUNCMP'
  ).trim();
  const cleanNumber = normalizeIndianMobile(params.mobile);

  if (!apiKey) {
    if (isSandboxOtpAllowed()) {
      return {
        sent: true,
        providerConfigured: false,
        sandboxMode: true,
        sandboxOtpPreview: params.otp,
        detail: 'Fast2SMS API key not configured; sandbox OTP preview active for non-production verification.',
      };
    }
    return {
      sent: false,
      providerConfigured: false,
      sandboxMode: false,
      detail: 'Fast2SMS gateway (FAST2SMS_API_KEY) is not configured on the server.',
    };
  }

  if (route === 'dlt' && !templateId) {
    return {
      sent: false,
      providerConfigured: true,
      sandboxMode: false,
      detail: 'Fast2SMS DLT route requires FAST2SMS_TEMPLATE_ID (your approved DLT Login OTP Template ID) on the server.',
    };
  }

  if (cleanNumber.length < 10) {
    return {
      sent: false,
      providerConfigured: true,
      sandboxMode: false,
      detail: 'Registered user mobile number is invalid for Fast2SMS dispatch.',
    };
  }

  try {
    const bodyPayload: Record<string, string> = {
      route,
      variables_values: params.otp,
      numbers: cleanNumber,
    };

    if (route === 'dlt') {
      if (senderId) bodyPayload.sender_id = senderId;
      bodyPayload.message = templateId;
      bodyPayload.flash = '0';
    } else if (route === 'q') {
      bodyPayload.message = `Your MUN COMPUTER login OTP is ${params.otp}. Valid for 5 minutes. Do not share.`;
      if (senderId) bodyPayload.sender_id = senderId;
      bodyPayload.flash = '0';
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const response = await fetch('https://www.fast2sms.com/dev/bulkV2', {
      method: 'POST',
      headers: {
        authorization: apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(bodyPayload),
      signal: controller.signal,
    });
    clearTimeout(timer);

    const data = (await response.json().catch(() => ({}))) as {
      return?: boolean;
      message?: string | string[];
      request_id?: string;
    };

    if (response.ok && data.return === true) {
      return {
        sent: true,
        providerConfigured: true,
        sandboxMode: false,
        detail: `Fast2SMS OTP dispatched cleanly (request: ${data.request_id || 'accepted'}).`,
      };
    }

    const errMsg = Array.isArray(data.message)
      ? data.message.join(', ')
      : data.message || `HTTP ${response.status}`;

    if (isSandboxOtpAllowed()) {
      return {
        sent: true,
        providerConfigured: true,
        sandboxMode: true,
        sandboxOtpPreview: params.otp,
        detail: `Fast2SMS notice (${errMsg}); non-production sandbox OTP preview active.`,
      };
    }

    return {
      sent: false,
      providerConfigured: true,
      sandboxMode: false,
      detail: `Fast2SMS gateway rejected OTP request: ${errMsg}`,
    };
  } catch (err) {
    const connErr =
      err instanceof Error
        ? `Fast2SMS connection error: ${err.message}`
        : 'Fast2SMS connection failed.';

    if (isSandboxOtpAllowed()) {
      return {
        sent: true,
        providerConfigured: true,
        sandboxMode: true,
        sandboxOtpPreview: params.otp,
        detail: `${connErr}; non-production sandbox OTP preview active.`,
      };
    }

    return {
      sent: false,
      providerConfigured: true,
      sandboxMode: false,
      detail: connErr,
    };
  }
}
