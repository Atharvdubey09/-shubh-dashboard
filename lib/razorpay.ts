import Razorpay from 'razorpay'
import crypto from 'crypto'

export function getRazorpayClient() {
  const keyId = process.env.RAZORPAY_KEY_ID
  const keySecret = process.env.RAZORPAY_KEY_SECRET
  if (!keyId || !keySecret) {
    throw new Error('Razorpay credentials (RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET) are not configured.')
  }
  return new Razorpay({
    key_id: keyId,
    key_secret: keySecret,
  })
}

/**
 * Creates an order in Razorpay
 * @param amount - Amount in Rupees
 * @param receipt - Unique receipt reference ID
 * @param notes - Metadata dictionary (e.g. { studentId: "..." })
 */
export async function createRazorpayOrder(amount: number, receipt: string, notes?: Record<string, string>) {
  const client = getRazorpayClient()
  const options = {
    amount: Math.round(amount * 100), // convert to paise
    currency: 'INR',
    receipt: receipt,
    notes: notes,
  }
  return await client.orders.create(options)
}

/**
 * Creates a unique payment link for a student
 * @param options - Payment link parameters
 */
export async function createRazorpayPaymentLink(options: {
  amount: number // in Rupees
  description: string
  customerName: string
  customerContact: string
  referenceId: string
  callbackUrl?: string
  notes?: Record<string, string>
}) {
  const client = getRazorpayClient()
  
  // Clean phone number (Razorpay requires 10 digit or international, no spaces)
  const cleanContact = options.customerContact.replace(/\s+/g, '')
  const formattedContact = cleanContact.startsWith('+') ? cleanContact : `+91${cleanContact.slice(-10)}`

  return await client.paymentLink.create({
    amount: Math.round(options.amount * 100), // convert to paise
    currency: 'INR',
    accept_partial: false,
    description: options.description,
    customer: {
      name: options.customerName,
      contact: formattedContact,
    },
    notify: {
      sms: true,
      email: false,
    },
    reference_id: options.referenceId,
    callback_url: options.callbackUrl,
    callback_method: 'get',
    notes: options.notes,
  })
}

/**
 * Creates a UPI QR Code
 * @param amount - Amount in Rupees
 * @param name - Label for the QR Code
 */
export async function createRazorpayQR(amount: number, name: string) {
  const client = getRazorpayClient()
  return await client.qrCode.create({
    type: 'upi_qr',
    name: name,
    usage: 'single_use',
    fixed_amount: true,
    payment_amount: Math.round(amount * 100),
    description: `Fees payment for ${name}`,
  })
}

/**
 * Verifies Razorpay Webhook Signatures
 */
export function verifyWebhookSignature(rawBody: string, signature: string, secret: string): boolean {
  try {
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex')
    return expectedSignature === signature
  } catch (error) {
    console.error('Webhook signature verification error:', error)
    return false
  }
}

/**
 * Verifies Razorpay Checkout Payment Signatures
 */
export function verifyCheckoutSignature(orderId: string, paymentId: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_KEY_SECRET
  if (!secret) {
    throw new Error('RAZORPAY_KEY_SECRET is not configured.')
  }
  try {
    const text = `${orderId}|${paymentId}`
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(text)
      .digest('hex')
    return expectedSignature === signature
  } catch (error) {
    console.error('Checkout signature verification error:', error)
    return false
  }
}
