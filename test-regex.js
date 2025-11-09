// Test regex patterns for phone and email

const phoneRegex = /(\+84|84|0)[\s\-.]?[1-9][\s\-.]?\d{1,2}[\s\-.]?\d{3}[\s\-.]?\d{3,4}/g;
const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

// Test cases
const testStrings = [
  // Phone numbers
  '0987654321',
  '098-765-4321',
  '098.765.4321',
  '098 765 4321',
  '+84987654321',
  '84987654321',
  '0123456789',
  '(098) 765-4321',
  
  // Emails
  'nguyen@example.com',
  'test.user@company.co.uk',
  'admin+tag@domain.com',
  'user_name@sub.domain.com',
  
  // Mixed
  'Contact: 0987654321 or email@test.com',
  'Phone: +84 98 765 4321, Email: admin@company.vn'
];

console.log('=== Testing Phone Regex ===');
testStrings.forEach(str => {
  const matches = str.match(phoneRegex);
  if (matches) {
    console.log(`✓ "${str}" → Found: ${matches.join(', ')}`);
  } else {
    console.log(`✗ "${str}" → No match`);
  }
});

console.log('\n=== Testing Email Regex ===');
testStrings.forEach(str => {
  const matches = str.match(emailRegex);
  if (matches) {
    console.log(`✓ "${str}" → Found: ${matches.join(', ')}`);
  } else {
    console.log(`✗ "${str}" → No match`);
  }
});
