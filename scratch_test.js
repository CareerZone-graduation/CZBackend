const fetch = require('node-fetch');

async function testAnswer() {
  const url = 'http://localhost:5000/api/test-assignments/69e36f267c28e4e3575e00e5/answer';
  const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY4NWE3NjczYzkyM2IxYmI4MDczMTQ3ZCIsInJvbGUiOiJjYW5kaWRhdGUiLCJpYXQiOjE3NzYxNzczMjksImV4cCI6MjY0MDA5MDkyOX0.w0jiJRTYhtIQQa7w27A3U_avviQzXw5DqSagk2qV5Pc';
  
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      questionId: '69e361487670cbc2af6e1014',
      selectedOptionId: '69e361487670cbc2af6e1015'
    })
  });
  
  const data = await response.json();
  console.log(JSON.stringify(data, null, 2));
}

testAnswer().catch(console.error);
