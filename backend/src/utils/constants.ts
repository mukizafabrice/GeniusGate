export const PAYMENT_CONSTANTS = {
  CURRENCY: 'USD',
  PAYMENT_METHODS: ['flutterwave', 'stripe', 'momo', 'airtel_money'] as const,
  MINIMUM_DEPOSIT: 1.00,
  AIRTEL_MONEY: {
    SUPPORTED_COUNTRIES: ['UG', 'KE', 'TZ', 'RW', 'ZM'],
    CURRENCIES: ['UGX', 'KES', 'TZS', 'RWF', 'ZMW']
  }
} as const;