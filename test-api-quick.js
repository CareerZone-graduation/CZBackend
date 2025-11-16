require('dotenv').config();
const http = require('http');

console.log('🔥 QUICK TEST: API most-applied-companies\n');
console.log('='.repeat(70));

const options = {
  hostname: 'localhost',
  port: 5000,
  path: '/api/analytics/most-applied-companies?limit=6',
  method: 'GET'
};

const req = http.request(options, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log(`Status: ${res.statusCode}\n`);
    
    if (res.statusCode !== 200) {
      console.log('❌ API FAILED!');
      console.log('Response:', data);
      return;
    }
    
    try {
      const json = JSON.parse(data);
      const companies = json.data || [];
      
      console.log(`✅ API trả về ${companies.length} công ty\n`);
      
      if (companies.length === 0) {
        console.log('❌ KHÔNG CÓ CÔNG TY NÀO!');
        console.log('\nNguyên nhân có thể:');
        console.log('1. Database không có applications');
        console.log('2. Không có công ty nào APPROVED');
        console.log('3. Tất cả jobs đều hết hạn\n');
        return;
      }
      
      console.log('📊 TOP COMPANIES (theo số CV):\n');
      console.log('Rank | Công ty                    | CVs | Jobs | Valid?');
      console.log('-'.repeat(70));
      
      companies.forEach((c, i) => {
        const rank = `${i + 1}`.padStart(4);
        const name = (c.companyName || 'N/A').padEnd(25).substring(0, 25);
        const apps = String(c.applicationCount || 0).padStart(4);
        const jobs = String(c.activeJobCount || 0).padStart(4);
        const valid = c.applicationCount > 0 ? '✅' : '❌';
        
        console.log(`${rank} | ${name} | ${apps} | ${jobs} | ${valid}`);
      });
      
      console.log('\n' + '='.repeat(70));
      
      // Kiểm tra xem có sắp xếp đúng không
      const isSorted = companies.every((c, i) => {
        if (i === 0) return true;
        return c.applicationCount <= companies[i-1].applicationCount;
      });
      
      console.log('\n🔍 KIỂM TRA:\n');
      console.log(`Sắp xếp theo applicationCount: ${isSorted ? '✅ ĐÚNG' : '❌ SAI'}`);
      
      // Kiểm tra có công ty nào có 0 CV không
      const hasZeroApps = companies.some(c => c.applicationCount === 0);
      if (hasZeroApps) {
        console.log('⚠️  CÓ CÔNG TY VỚI 0 CV trong danh sách!');
        console.log('   → Code có filter nhưng vẫn hiển thị công ty 0 CV');
      }
      
      // Kiểm tra top 1
      const top1 = companies[0];
      console.log(`\nTop 1: ${top1.companyName}`);
      console.log(`  - Applications: ${top1.applicationCount} CV`);
      console.log(`  - Active Jobs: ${top1.activeJobCount}`);
      
      if (top1.applicationCount === 0) {
        console.log('\n❌ VẤN ĐỀ: Top 1 có 0 CV!');
        console.log('   → Backend đang fallback về top-companies (by job count)');
        console.log('   → Không có công ty nào có applications!\n');
      } else {
        console.log('\n✅ Top 1 có CV, logic đúng!\n');
      }
      
      console.log('='.repeat(70));
      console.log('\n💡 NẾU VẪN SAI:');
      console.log('1. Frontend có thể đang cache');
      console.log('2. Restart frontend: npm run dev');
      console.log('3. Hard refresh: Ctrl+Shift+R');
      console.log('4. Check browser console logs\n');
      
    } catch (e) {
      console.log('❌ Failed to parse JSON');
      console.log(data);
    }
  });
});

req.on('error', (e) => {
  console.log('❌ CONNECTION FAILED!');
  console.log('Error:', e.message);
  console.log('\nNguyên nhân:');
  console.log('1. Backend chưa chạy');
  console.log('2. Port 5000 không mở');
  console.log('3. Firewall chặn\n');
  console.log('Giải pháp:');
  console.log('cd d:\\TLCN\\TLCN\\CareerZone-BE');
  console.log('npm run dev\n');
});

req.end();
