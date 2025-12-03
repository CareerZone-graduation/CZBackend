import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../.env') });

import RecruiterProfile from '../src/models/RecruiterProfile.js';

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.DB_URI);
        console.log('✅ MongoDB connected successfully\n');
    } catch (error) {
        console.error('❌ MongoDB connection error:', error);
        process.exit(1);
    }
};


const companyNames = [
  // --- CÔNG NGHỆ & VIỄN THÔNG (TECH & TELECOM) ---
  "FPT Telecom", "FPT Information System", "FPT Retail", "FPT Online",
  "Viettel Group", "Viettel Telecom", "Viettel Global", "Viettel Post", "Viettel Solutions",
  "VNPT", "Vinaphone", "Mobifone", "CMC Corporation", "CMC Telecom", "CMC Global",
  "VNG Corporation", "ZaloPay", "VNG Games", "MISA", "Bkav", "VCCorp", "Appota",
  "VNPAY", "MoMo", "Tiki", "Sendo", "Shopee Vietnam", "Lazada Vietnam", "Grab Vietnam",
  "Be Group", "Gojek Vietnam", "Ahamove", "Loship", "Foody", "Baemin Vietnam",
  "Topica Edtech Group", "VuiApp", "KiotViet", "Sapo", "Haravan", "Base.vn",
  "VinBigdata", "VinCSS", "VinAI", "SmartPay", "Zalo Cloud", "NextTech Group",
  "Rikkeisoft", "VTI Group", "Luvina Software", "KMS Technology", "NashTech Vietnam",
  "Robert Bosch Engineering Vietnam", "Samsung R&D Center Hanoi", "LG Electronics R&D",
  "Panasonic R&D Center", "Toshiba Software Development", "Framgia Vietnam (Sun Asterisk)",
  "Hybrid Technologies", "Ominext", "HBLAB", "Evolable Asia", "Techacode", "SotaTek",
  "One Mount Group", "VinID", "Trusting Social", "Elsa Speak", "GotIt!", "Axon Active",
  "DEK Technologies", "TMA Solutions", "Global Cybersoft", "LogiGear", "Fujinet Systems",
  "Harvey Nash Vietnam", "Cốc Cốc", "VTVlive", "Vega Corporation", "G-Group", "Tima",
  "NextPay", "Payoo", "SmartNet", "Vimo", "Alepay", "NganLuong.vn", "BaoKim.vn",
  "OnPoint", "Ecomobi", "Accesstrade Vietnam", "Yeah1 Group", "POPS Worldwide",
  "DatVietVAC", "Galaxy M&E", "BHD Star", "CGV Vietnam", "Lotte Cinema Vietnam",

  // --- NGÂN HÀNG & TÀI CHÍNH (BANKING & FINANCE) ---
  "Vietcombank", "VietinBank", "BIDV", "Agribank", "Techcombank", "VPBank", "MBBank",
  "ACB (Asia Commercial Bank)", "Sacombank", "HDBank", "VIB (Vietnam International Bank)",
  "SHB (Saigon-Hanoi Bank)", "SeABank", "MSB (Maritime Bank)", "OCB (Orient Commercial Bank)",
  "TPBank", "LienVietPostBank (LPBank)", "Eximbank", "Bac A Bank", "Nam A Bank",
  "Viet Capital Bank (Ban Viet)", "Kienlongbank", "Saigonbank", "Vietbank", "PGBank",
  "GPBank", "OceanBank", "CB Bank", "Shinhan Bank Vietnam", "Woori Bank Vietnam",
  "HSBC Vietnam", "Standard Chartered Vietnam", "Citibank Vietnam", "UOB Vietnam",
  "Public Bank Vietnam", "Hong Leong Bank Vietnam", "CIMB Bank Vietnam", "Indovina Bank",
  "VRB (Vietnam-Russia Bank)", "FE Credit", "Home Credit Vietnam", "HD Saison",
  "Mcredit", "Shinhan Finance", "Lotte Finance", "Mirae Asset Finance", "JACCS Vietnam",
  "SSI Securities", "VNDIRECT Securities", "HSC (Ho Chi Minh City Securities)",
  "VPS Securities", "MBS (MB Securities)", "TCBS (Techcom Securities)", "VCBS", "BSC",
  "FPTS", "KIS Vietnam", "Mirae Asset Securities", "Yuanta Vietnam", "Pinetree Securities",
  "Bao Viet Holdings", "Bao Viet Insurance", "PVI Insurance", "PTI Insurance", "MIC Insurance",
  "BMI (Bao Minh Insurance)", "Manulife Vietnam", "Prudential Vietnam", "Dai-ichi Life Vietnam",
  "AIA Vietnam", "Chubb Life Vietnam", "FWD Vietnam", "Generali Vietnam", "Hanwha Life Vietnam",
  "Cathay Life Vietnam", "Sun Life Vietnam", "Map Life", "MB Ageas Life",

  // --- BẤT ĐỘNG SẢN & XÂY DỰNG (REAL ESTATE & CONSTRUCTION) ---
  "Vingroup", "Vinhomes", "Vincom Retail", "Novaland", "Dat Xanh Group", "Hung Thinh Corp",
  "Sun Group", "BIM Group", "CEO Group", "Nam Long Group", "Khang Dien", "Phat Dat Corp",
  "Van Phu - Invest", "Ha Do Group", "Him Lam", "Bitexco Group", "Geleximco", "BRG Group",
  "T&T Group", "Ecopark Corp", "Phu My Hung Corp", "SonKim Land", "Masterise Homes",
  "Keppel Land Vietnam", "CapitaLand Vietnam", "Gamuda Land Vietnam", "Tokyu Land",
  "Coteccons", "Hoa Binh Construction Group", "Ricons", "Unicons", "Newtecons",
  "Central Construction", "Delta Group", "Ecoba Vietnam", "Phuc Hung Holdings",
  "Hung Thinh Incons", "Vinaconex", "Song Da Corporation", "Licogi 16", "Cienco 4",
  "Deo Ca Group", "Trung Nam Group", "Xuan Thien Group", "Bamboo Capital (BCG)",
  "Ree Corporation", "Fecon", "Phan Vu Group", "Eurowindow", "Austdoor", "Viglacera",
  "Vicostone", "Prime Group", "Dong Tam Group", "Hoa Sen Group", "Ton Dong A",
  "Nam Kim Steel", "Pomina Steel", "Hoa Phat Group", "SMC Trading", "Tien Len Steel",

  // --- BÁN LẺ & TIÊU DÙNG (RETAIL & FMCG) ---
  "Masan Group", "Masan Consumer", "WinCommerce (WinMart)", "Masan MeatLife",
  "Vinamilk", "TH True Milk", "Nutifood", "IDP (Love'in Farm)", "Moc Chau Milk",
  "Dutch Lady Vietnam", "Nestle Vietnam", "Coca-Cola Vietnam", "Suntory PepsiCo Vietnam",
  "Unilever Vietnam", "P&G Vietnam", "Kimberly-Clark Vietnam", "Colgate-Palmolive Vietnam",
  "Acecook Vietnam", "Vifon", "Miliket", "Cholimex Food", "Kido Group", "Tuong An Oil",
  "Vocarimex", "Cai Lan Oils", "Vedan Vietnam", "Ajinomoto Vietnam", "Miwon Vietnam",
  "Sabeco", "Habeco", "Carlsberg Vietnam", "Heineken Vietnam", "Tan Hiep Phat",
  "Trung Nguyen Legend", "Highlands Coffee", "The Coffee House", "Phuc Long", "King Coffee",
  "Starbucks Vietnam", "Pizza 4P's", "Golden Gate Group", "Redsun ITI", "KFC Vietnam",
  "Lotteria Vietnam", "Jollibee Vietnam", "McDonald's Vietnam", "Dominos Pizza Vietnam",
  "Mobile World (The Gioi Di Dong)", "Dien May Xanh", "Bach Hoa Xanh", "FPT Shop",
  "CellphoneS", "Hoang Ha Mobile", "Di Dong Viet", "MediaMart", "Pico", "Nguyen Kim",
  "Cho Lon Electronics", "Aeon Vietnam", "Central Retail Vietnam (Big C/Go!)",
  "Lotte Mart Vietnam", "Co.opmart (Saigon Co.op)", "Satra", "Hapro", "MM Mega Market",
  "Circle K Vietnam", "FamilyMart Vietnam", "7-Eleven Vietnam", "GS25 Vietnam",
  "Ministop", "Shop&Go", "Pharmacity", "Long Chau Pharmacy", "An Khang Pharmacy",
  "Guardian Vietnam", "Watsons Vietnam", "Hasaki", "Sociolla Vietnam",
  "PNJ (Phu Nhuan Jewelry)", "DOJI Gold & Gems", "SJC", "Bao Tin Minh Chau",

  // --- SẢN XUẤT & CÔNG NGHIỆP (MANUFACTURING & INDUSTRY) ---
  "Petrovietnam (PVN)", "PV Gas", "Binh Son Refining (BSR)", "Petrolimex", "PVOil",
  "EVN (Electricity Vietnam)", "EVN Genco 1", "EVN Genco 2", "EVN Genco 3", "PV Power",
  "Vinacomin (TKV)", "Vinachem", "VRG (Vietnam Rubber Group)", "Dabaco", "CP Vietnam",
  "Cargill Vietnam", "GreenFeed Vietnam", "Japfa Comfeed Vietnam", "Vissan", "Ba Huan",
  "Samsung Electronics Vietnam", "Samsung Display Vietnam", "Intel Products Vietnam",
  "Canon Vietnam", "Foxconn Vietnam", "Luxshare-ICT Vietnam", "Goertek Vina",
  "Compal Vietnam", "Pegatron Vietnam", "Honda Vietnam", "Toyota Vietnam", "Ford Vietnam",
  "Mercedes-Benz Vietnam", "Truong Hai Auto (THACO)", "TC Motor (Hyundai Thanh Cong)",
  "VinFast", "Yamaha Motor Vietnam", "Piaggio Vietnam", "Suzuki Vietnam", "Mitsubishi Motors",
  "Cheng Shin Tire", "Casumina", "DRC (Da Nang Rubber)", "SRC (Sao Vang Rubber)",
  "Rang Dong", "Dien Quang", "Cadivi", "LS Vina", "Tiphaco", "Imexpharm", "Domesco",
  "DHG Pharma (Duoc Hau Giang)", "Traphaco", "Pymepharco", "Sanofi Vietnam",
  "Rohto-Mentholatum Vietnam", "An Phat Holdings", "Stavian Chemical", "Opec Plastics",
  "Duy Tan Plastics", "Tien Phong Plastic", "Binh Minh Plastic", "Viet A Corp",

  // --- LOGISTICS & VẬN TẢI (LOGISTICS & TRANSPORT) ---
  "Vietnam Airlines", "Vietjet Air", "Bamboo Airways", "Pacific Airlines", "Vietravel Airlines",
  "Hai Au Aviation", "Vietnam Railways", "Saigon New Port (Tan Cang)", "Gemadept",
  "Vinafco", "Sotrans", "Transimex", "Indo Trans Logistics (ITL)", "Bee Logistics",
  "Vantage Logistics", "Dolphin Sea Air", "U&I Logistics", "Mai Linh Group", "Vinasun",
  "Phuong Trang (Futa Bus Lines)", "Thanh Buoi", "Kumho Samco", "Saigontourist", "Vietravel",
  "Ben Thanh Tourist", "Hanoitourist", "Fiditour", "Dat Viet Tour", "Lua Viet Tours",

  // --- SME & CÔNG TY CỔ PHẦN/TNHH KHÁC (GENERIC/SME MIX) ---
  "Công ty TNHH Thương mại Dịch vụ Tân Hiệp", "Công ty CP Đầu tư Xây dựng An Phú",
  "Công ty TNHH MTV Xuất Nhập Khẩu Bình Minh", "Công ty TNHH Giải pháp Công nghệ Việt",
  "Công ty CP Tư vấn Thiết kế Thành Công", "Công ty TNHH Dệt may Thái Bình",
  "Công ty TNHH Cơ khí Chính xác Delta", "Công ty CP Nông nghiệp Sạch Hưng Yên",
  "Công ty TNHH Vận tải Biển Đông", "Công ty CP Truyền thông Sao Kim",
  "Công ty TNHH Nội thất Gỗ Xanh", "Công ty TNHH Nhựa Bao bì Tín Phát",
  "Công ty CP Thực phẩm Dinh dưỡng Nutri", "Công ty TNHH Kỹ thuật Điện Quang Minh",
  "Công ty CP Giáo dục Quốc tế Á Châu", "Công ty TNHH Du lịch Biển Xanh",
  "Công ty TNHH Dược phẩm Tâm An", "Công ty CP Đầu tư Tài chính Hoàng Gia",
  "Công ty TNHH MTV Xây dựng Số 1", "Công ty TNHH Thương mại Quốc tế Global",
  "Công ty CP Công nghệ Xanh", "Công ty TNHH May mặc Việt Tiến", "May 10", "May Nhà Bè",
  "Dệt may Thành Công", "Sợi Thế Kỷ", "Gilimex", "TNG Investment", "May Sông Hồng",
  "Công ty CP Bóng đèn Phích nước Rạng Đông", "Công ty TNHH MTV Cao su Thống Nhất",
  "Công ty CP Nhựa Thiếu Niên Tiền Phong", "Công ty CP Nhựa Bình Minh",
  "Công ty TNHH MTV Thuốc lá Sài Gòn", "Công ty CP Bánh kẹo Hải Châu",
  "Công ty TNHH Nước giải khát Chương Dương", "Công ty CP Bia Hà Nội - Hải Dương",
  "Công ty CP Thủy điện Thác Bà", "Công ty CP Nhiệt điện Phả Lại",
  "Công ty TNHH MTV Môi trường Đô thị Hà Nội", "Công ty CP Cấp nước Thủ Đức",
  "Công ty CP Chiếu sáng Công cộng TP.HCM", "Công ty TNHH MTV Công viên Cây xanh",
  "Công ty Luật TNHH SMiC", "Văn phòng Luật sư YKVN", "Công ty Luật VILAF",
  "Công ty Kiểm toán Deloitte Vietnam", "Công ty Kiểm toán KPMG Vietnam",
  "Công ty Kiểm toán Ernst & Young Vietnam", "Công ty Kiểm toán PwC Vietnam",
  "Công ty TNHH Grant Thornton Vietnam", "Công ty TNHH Mazars Vietnam",
  "Công ty CP Quảng cáo Cáo Đỏ", "Agency Ogilvy Vietnam", "Dentsu Vietnam",
  "Leo Burnett Vietnam", "TBWA Vietnam", "JW Thompson Vietnam",
  "Công ty TNHH Sự kiện Pro Events", "Công ty CP Truyền thông Đa phương tiện VTC",
  "Công ty TNHH Phần mềm FPT Software HCM", "Công ty TNHH Giải pháp Phần mềm Tinh Vân",
  "Công ty CP Tập đoàn Công nghệ CMC", "Công ty TNHH Hệ thống Thông tin FPT",
  "Công ty CP Dịch vụ Viễn thông Sao Bắc Đẩu", "Công ty TNHH MTV Viễn thông Quốc tế FPT",
  "Công ty CP Hạ tầng Viễn thông CMC", "Công ty TNHH MTV Datacenter Viettel",
  "Công ty CP Tập đoàn Masan", "Công ty TNHH MTV Masan Brewery",
  "Công ty CP Hàng tiêu dùng Masan", "Công ty TNHH Khai thác Chế biến Khoáng sản Núi Pháo",
  "Công ty TNHH Một thành viên Vinpearl", "Công ty CP Vincom Retail",
  "Công ty TNHH Kinh doanh Thương mại và Dịch vụ VinFast", "Công ty CP Vinhomes",
  "Công ty CP Nghiên cứu và Sản xuất VinSmart", "Công ty TNHH Giáo dục Vinschool",
  "Bệnh viện Đa khoa Quốc tế Vinmec", "Trường Đại học VinUni",
  "Công ty TNHH MTV Lọc hóa dầu Bình Sơn", "Tổng Công ty Khí Việt Nam",
  "Tổng Công ty Điện lực Dầu khí Việt Nam", "Tổng Công ty Dầu Việt Nam",
  "Tổng Công ty Phân bón và Hóa chất Dầu khí", "Tổng Công ty Cổ phần Dịch vụ Kỹ thuật Dầu khí",
  "Công ty TNHH MTV Đạm Ninh Bình", "Công ty CP Phân đạm và Hóa chất Hà Bắc",
  "Công ty CP Supe Phốt phát và Hóa chất Lâm Thao", "Công ty CP Phân bón Bình Điền",
  "Công ty CP Cao su Đà Nẵng", "Công ty CP Cao su Sao Vàng", "Công ty CP Cao su Miền Nam",
  "Công ty TNHH MTV Cao su Phú Riềng", "Công ty TNHH MTV Cao su Dầu Tiếng",
  "Công ty TNHH MTV Cao su Đồng Nai", "Tập đoàn Công nghiệp Than - Khoáng sản Việt Nam",
  "Tổng Công ty Công nghiệp Mỏ Việt Bắc", "Tổng Công ty Khoáng sản TKV",
  "Công ty Nhôm Đắk Nông - TKV", "Công ty Nhôm Lâm Đồng - TKV",
  "Tổng Công ty Thép Việt Nam", "Công ty CP Thép Thái Nguyên", "Công ty CP Thép Vicasa",
  "Công ty CP Thép Thủ Đức", "Công ty CP Thép Nhà Bè", "Công ty TNHH Thép SeAH Việt Nam",
  "Công ty TNHH Posco Vietnam", "Công ty TNHH Formosa Ha Tinh Steel",
  "Công ty CP Tập đoàn Hoa Sen", "Công ty CP Thép Nam Kim", "Công ty CP Thép Pomina",
  "Công ty CP Gang thép Cao Bằng", "Công ty CP Kim loại màu Thái Nguyên",
  "Công ty CP Cáp điện Việt Nam (Cadivi)", "Công ty CP Cơ điện lạnh (REE)",
  "Công ty CP Chế tạo Điện cơ Hà Nội (HEM)", "Công ty CP Thiết bị điện Gelex",
  "Tổng Công ty Thiết bị điện Đông Anh", "Công ty CP Pin Ắc quy Miền Nam (Pinaco)",
  "Công ty CP Bóng đèn Điện Quang", "Công ty CP Nhựa Rạng Đông",
  "Công ty TNHH MTV Nhựa 19-5", "Công ty CP Nhựa Đồng Nai", "Công ty CP Nhựa Ngọc Nghĩa",
  "Công ty CP Bao bì Nhựa Tân Tiến", "Công ty TNHH Bao bì Alcamax",
  "Công ty TNHH Sản xuất Bao bì Vafaco", "Công ty CP Giấy Sài Gòn", "Công ty CP Giấy An Hòa",
  "Tổng Công ty Giấy Việt Nam", "Công ty TNHH Giấy Lee & Man Việt Nam",
  "Công ty CP Gỗ An Cường", "Công ty CP Gỗ Đức Thành", "Công ty CP Chế biến Gỗ Thuận An",
  "Công ty CP Lâm nông sản thực phẩm Yên Bái", "Công ty CP Tre Công nghiệp Thống Nhất",
  "Công ty TNHH Minh Long I", "Công ty TNHH Gốm sứ Cường Phát",
  "Tổng Công ty Viglacera", "Công ty CP Gạch men Chang Yih", "Công ty CP Gạch ngói Đồng Nai",
  "Công ty CP Xi măng Vicem Hà Tiên", "Công ty CP Xi măng Bỉm Sơn",
  "Công ty CP Xi măng Hoàng Thạch", "Công ty CP Xi măng Bút Sơn",
  "Công ty TNHH Xi măng Nghi Sơn", "Công ty TNHH Xi măng Holcim Việt Nam",
  "Công ty TNHH Xi măng Chinfon", "Công ty CP Đầu tư Hạ tầng Kỹ thuật TP.HCM (CII)",
  "Công ty CP Đầu tư Cầu đường CII", "Công ty CP Xây dựng Hạ tầng CII",
  "Tổng Công ty Đầu tư Phát triển Đường cao tốc Việt Nam (VEC)",
  "Tổng Công ty Cửu Long (CIPM)", "Tập đoàn Đèo Cả", "Công ty CP Đầu tư Hạ tầng Giao thông Đèo Cả",
  "Công ty CP Xây dựng Phục Hưng Holdings", "Công ty CP Đầu tư Xây dựng Ricons",
  "Công ty CP Xây dựng Coteccons", "Công ty CP Tập đoàn Xây dựng Hòa Bình",
  "Công ty CP Hưng Thịnh Incons", "Công ty CP Fecon", "Công ty CP Tập đoàn Đất Xanh",
  "Công ty CP Dịch vụ Bất động sản Đất Xanh", "Công ty CP Đầu tư Nam Long",
  "Công ty CP Đầu tư và Kinh doanh Nhà Khang Điền", "Công ty CP Phát triển Bất động sản Phát Đạt",
  "Công ty CP Tập đoàn C.E.O", "Công ty CP Tập đoàn Hà Đô", "Công ty CP Tập đoàn An Gia",
  "Công ty CP Đầu tư Văn Phú - Invest", "Tổng Công ty IDICO",
  "Tổng Công ty Phát triển Đô thị Kinh Bắc", "Công ty CP Sonadezi Châu Đức",
  "Công ty CP Long Hậu", "Công ty CP KCN Nam Tân Uyên", "Công ty CP KCN Tân Bình",
  "Công ty CP KCN Hiệp Phước", "Công ty TNHH VSIP Nghệ An", "Công ty LD TNHH KCN Việt Nam - Singapore",
  "Công ty CP Cảng Hải Phòng", "Công ty CP Cảng Sài Gòn", "Công ty CP Cảng Đà Nẵng",
  "Công ty CP Cảng Quy Nhơn", "Công ty CP Cảng Cát Lái", "Công ty CP Cảng Đoạn Xá",
  "Công ty CP Đại lý Giao nhận Vận tải Xếp dỡ Tân Cảng", "Công ty CP Gemadept",
  "Công ty CP Vận tải Xăng dầu Vitaco", "Công ty CP Vận tải Biển Việt Nam (Vosco)",
  "Công ty CP Vận tải và Thuê tàu biển Việt Nam (Vitranschart)",
  "Tổng Công ty Hàng hải Việt Nam (VIMC)", "Công ty TNHH MTV Vận tải Biển Đông",
  "Công ty CP Kho vận Miền Nam (Sotrans)", "Công ty CP Giao nhận Kho vận Ngoại thương (Vietrans)",
  "Công ty CP Logistics Vinalink", "Công ty CP Transimex", "Công ty CP U&I Logistics",
  "Công ty TNHH Bee Logistics", "Công ty CP Giao Hàng Tiết Kiệm", "Công ty CP Giao Hàng Nhanh",
  "Công ty TNHH Ninja Van Việt Nam", "Công ty TNHH J&T Express Việt Nam",
  "Công ty CP Bưu chính Viettel (Viettel Post)", "Tổng Công ty Bưu điện Việt Nam (VNPost)",
  "Công ty CP Dịch vụ Tức thời (Ahamove)", "Công ty CP Lozi Việt Nam (Loship)",
  "Công ty TNHH Grab", "Công ty CP Be Group", "Công ty TNHH Gojek Việt Nam",
  "Công ty CP Xe khách Phương Trang (FUTA Bus Lines)", "Công ty TNHH Thành Bưởi",
  "Công ty CP Ánh Dương Việt Nam (Vinasun Corp)", "Công ty CP Tập đoàn Mai Linh",
  "Hợp tác xã Vận tải Số 1", "Hợp tác xã Vận tải 19/5",
  "Công ty TNHH MTV Xe khách Sài Gòn (SaigonBus)", "Tổng Công ty Vận tải Hà Nội (Transerco)",
  "Công ty CP Du lịch và Tiếp thị GTVT Việt Nam (Vietravel)",
  "Tổng Công ty Du lịch Sài Gòn (Saigontourist)", "Công ty CP Du lịch Hà Nội (Hanoitourist)",
  "Công ty CP Du lịch Dịch vụ Dầu khí (OSC Vietnam)", "Công ty CP Du lịch Thành Thành Công (TTC Hospitality)",
  "Công ty CP Khách sạn Thắng Lợi", "Công ty CP Khách sạn Sài Gòn - Hạ Long",
  "Công ty TNHH Khu du lịch Vịnh Thiên Đường (ALMA)", "Công ty CP Vinpearl",
  "Công ty CP Sun World", "Công ty CP Tập đoàn FLC", "Công ty CP Hàng không Tre Việt (Bamboo Airways)",
  "Công ty CP Hàng không Vietjet", "Tổng Công ty Hàng không Việt Nam (Vietnam Airlines)",
  "Công ty CP Hàng không Pacific Airlines", "Công ty TNHH Hàng không Lữ hành Việt Nam (Vietravel Airlines)",
  "Công ty CP Suất ăn Hàng không Nội Bài (NCS)", "Công ty CP Dịch vụ Hàng không Sân bay Tân Sơn Nhất (SASCO)",
  "Công ty CP Dịch vụ Hàng không Taseco", "Tổng Công ty Cảng Hàng không Việt Nam (ACV)",
  "Công ty Quản lý Bay Việt Nam (VATM)", "Công ty TNHH Kỹ thuật Máy bay (VAECO)",
  "Công ty CP Đào tạo Bay Việt", "Công ty CP Nhiên liệu Bay Petrolimex (Skypec)",
  "Công ty TNHH MTV Nhiên liệu Hàng không Việt Nam (Skypec)",
  "Ngân hàng TMCP Ngoại thương Việt Nam (Vietcombank)", "Ngân hàng TMCP Công thương Việt Nam (VietinBank)",
  "Ngân hàng TMCP Đầu tư và Phát triển Việt Nam (BIDV)", "Ngân hàng Nông nghiệp và PTNT Việt Nam (Agribank)",
  "Ngân hàng TMCP Kỹ thương Việt Nam (Techcombank)", "Ngân hàng TMCP Quân đội (MB)",
  "Ngân hàng TMCP Việt Nam Thịnh Vượng (VPBank)", "Ngân hàng TMCP Á Châu (ACB)",
  "Ngân hàng TMCP Sài Gòn Thương Tín (Sacombank)", "Ngân hàng TMCP Phát triển TP.HCM (HDBank)",
  "Ngân hàng TMCP Quốc tế Việt Nam (VIB)", "Ngân hàng TMCP Sài Gòn - Hà Nội (SHB)",
  "Ngân hàng TMCP Tiên Phong (TPBank)", "Ngân hàng TMCP Phương Đông (OCB)",
  "Ngân hàng TMCP Hàng Hải Việt Nam (MSB)", "Ngân hàng TMCP Đông Nam Á (SeABank)",
  "Ngân hàng TMCP Bưu điện Liên Việt (LPBank)", "Ngân hàng TMCP Xuất Nhập Khẩu Việt Nam (Eximbank)",
  "Ngân hàng TMCP Bắc Á (Bac A Bank)", "Ngân hàng TMCP Nam Á (Nam A Bank)",
  "Ngân hàng TMCP Bản Việt (BVBank)", "Ngân hàng TMCP Kiên Long (Kienlongbank)",
  "Ngân hàng TMCP Sài Gòn Công Thương (Saigonbank)", "Ngân hàng TMCP Việt Nam Thương Tín (Vietbank)",
  "Ngân hàng TMCP Xăng dầu Petrolimex (PGBank)", "Ngân hàng TNHH MTV Đại Dương (OceanBank)",
  "Ngân hàng TNHH MTV Xây dựng (CB Bank)", "Ngân hàng TNHH MTV Dầu khí Toàn cầu (GPBank)",
  "Công ty Tài chính TNHH MTV Ngân hàng Việt Nam Thịnh Vượng (FE Credit)",
  "Công ty Tài chính TNHH MTV Home Credit Việt Nam", "Công ty Tài chính HD Saison",
  "Công ty Tài chính TNHH MB Shinsei (Mcredit)", "Công ty Tài chính TNHH MTV Shinhan Việt Nam",
  "Công ty Tài chính TNHH MTV Lotte Việt Nam", "Công ty Tài chính TNHH MTV Mirae Asset",
  "Công ty Chứng khoán SSI", "Công ty CP Chứng khoán VNDIRECT",
  "Công ty CP Chứng khoán TP.HCM (HSC)", "Công ty CP Chứng khoán Bản Việt (VCSC)",
  "Công ty CP Chứng khoán MB (MBS)", "Công ty CP Chứng khoán Kỹ thương (TCBS)",
  "Công ty CP Chứng khoán FPT (FPTS)", "Công ty CP Chứng khoán Bảo Việt (BVSC)",
  "Công ty CP Chứng khoán Ngân hàng BIDV (BSC)", "Công ty CP Chứng khoán VPS",
  "Tập đoàn Bảo Việt", "Tổng Công ty Bảo hiểm Bảo Việt", "Tổng Công ty Bảo hiểm PVI",
  "Tổng Công ty CP Bảo hiểm Bưu điện (PTI)", "Tổng Công ty CP Bảo hiểm Quân đội (MIC)",
  "Tổng Công ty CP Bảo hiểm Bảo Minh (BMI)", "Tổng Công ty CP Bảo hiểm Petrolimex (PJICO)",
  "Tổng Công ty CP Bảo hiểm Ngân hàng BIDV (BIC)", "Tổng Công ty CP Bảo hiểm Hàng không (VNI)",
  "Công ty TNHH Bảo hiểm Nhân thọ Prudential Việt Nam", "Công ty TNHH Bảo hiểm Nhân thọ Manulife Việt Nam",
  "Công ty TNHH Bảo hiểm Nhân thọ Dai-ichi Việt Nam", "Công ty TNHH Bảo hiểm Nhân thọ AIA Việt Nam",
  "Công ty TNHH Bảo hiểm Nhân thọ Chubb Life Việt Nam", "Công ty TNHH Bảo hiểm Nhân thọ FWD Việt Nam",
  "Công ty TNHH Bảo hiểm Nhân thọ Generali Việt Nam", "Công ty TNHH Bảo hiểm Nhân thọ Hanwha Life",
  "Công ty TNHH Bảo hiểm Nhân thọ Sun Life Việt Nam", "Công ty TNHH Bảo hiểm Nhân thọ Cathay Life",
  "Công ty TNHH Máy tính và Viễn thông An Khang", "Công ty TNHH Tin học Thành Nhân",
  "Công ty TNHH Thương mại Dịch vụ Tin học Phong Vũ", "Công ty CP Thế Giới Số (Digiworld)",
  "Công ty CP Dịch vụ Tổng hợp Dầu khí (Petrosetco)", "Công ty CP Bán lẻ Kỹ thuật số FPT (FPT Shop)",
  "Công ty TNHH Thương mại Kỹ thuật Di Động Việt", "Công ty TNHH Một thành viên Công nghệ Tin học Viễn Sơn",
  "Công ty TNHH Phân phối Synnex FPT", "Công ty CP Đầu tư Thế Giới Di Động",
  "Công ty CP Thương mại Dịch vụ Mạng Lưới Thông Minh (SmartNet)",
  "Công ty CP Giải pháp Thanh toán Việt Nam (VNPAY)", "Công ty CP Dịch vụ Di động Trực tuyến (M_Service)",
  "Công ty CP Zion (ZaloPay)", "Công ty CP Công nghệ và Dịch vụ Moca",
  "Công ty CP Trung gian Thanh toán Ngân Lượng", "Công ty CP Thương mại Điện tử Bảo Kim",
  "Công ty CP Giải pháp Phần mềm Hòa Bình (PeaceSoft)", "Công ty TNHH Shopee",
  "Công ty TNHH Recess (Lazada)", "Công ty CP Ti Ki (Tiki)", "Công ty CP Công nghệ Sen Đỏ (Sendo)",
  "Công ty TNHH GrabTaxi", "Công ty CP Be Group", "Công ty TNHH Gojek",
  "Công ty CP Foody", "Công ty CP Giao Hàng Nhanh", "Công ty TNHH Sapo Technology",
  "Công ty CP Công nghệ Haravan", "Công ty CP Base Enterprise", "Công ty CP MISA",
  "Công ty CP An ninh Mạng Bkav", "Công ty CP Tập đoàn Công nghệ CMC",
  "Công ty TNHH Phần mềm FPT (FPT Software)", "Công ty TNHH Harvey Nash Việt Nam",
  "Công ty TNHH KMS Technology Việt Nam", "Công ty TNHH Robert Bosch Engineering",
  "Công ty TNHH Samsung Electronics Việt Nam Thái Nguyên", "Công ty TNHH Samsung Display Bắc Ninh",
  "Công ty TNHH LG Electronics Việt Nam Hải Phòng", "Công ty TNHH Panasonic Việt Nam",
  "Công ty TNHH Canon Việt Nam", "Công ty TNHH Honda Việt Nam",
  "Công ty TNHH Toyota Motor Việt Nam", "Công ty TNHH Ford Việt Nam",
  "Công ty TNHH Ô tô Mitsubishi Việt Nam", "Công ty TNHH Suzuki Việt Nam",
  "Công ty TNHH Yamaha Motor Việt Nam", "Công ty CP Ô tô Trường Hải (THACO)",
  "Công ty CP Tập đoàn Thành Công (TC Group)", "Công ty TNHH Sản xuất và Kinh doanh VinFast",
  "Công ty CP Sữa Việt Nam (Vinamilk)", "Công ty CP Thực phẩm Dinh dưỡng NutiFood",
  "Công ty CP Sữa TH (TH True Milk)", "Công ty CP Giống Bò sữa Mộc Châu",
  "Công ty TNHH FrieslandCampina Việt Nam", "Công ty TNHH Nestlé Việt Nam",
  "Công ty TNHH Nước giải khát Coca-Cola Việt Nam", "Công ty TNHH Nước giải khát Suntory PepsiCo",
  "Tổng Công ty Bia - Rượu - Nước giải khát Sài Gòn (Sabeco)",
  "Tổng Công ty Bia - Rượu - Nước giải khát Hà Nội (Habeco)",
  "Công ty TNHH Nhà máy Bia Heineken Việt Nam", "Công ty TNHH Carlsberg Việt Nam",
  "Tập đoàn Tân Hiệp Phát", "Công ty CP Hàng tiêu dùng Masan (Masan Consumer)",
  "Công ty TNHH Dầu thực vật Cái Lân", "Công ty CP Tập đoàn Kido",
  "Công ty CP Thực phẩm Cholimex", "Công ty CP Kỹ nghệ Thực phẩm Việt Nam (Vifon)",
  "Công ty CP Lương thực Thực phẩm Colusa - Miliket", "Công ty CP Bánh kẹo Bibica",
  "Công ty CP Bánh kẹo Hải Hà", "Công ty CP Thực phẩm Hữu Nghị",
  "Công ty TNHH Mondelez Kinh Đô Việt Nam", "Công ty TNHH Orion Food Vina",
  "Công ty TNHH Acecook Việt Nam", "Công ty CP Uniben", "Công ty CP Tập đoàn Thủy sản Minh Phú",
  "Công ty CP Vĩnh Hoàn", "Công ty CP Nam Việt (Navico)", "Công ty CP Thực phẩm Sao Ta",
  "Công ty CP Tập đoàn Lộc Trời", "Công ty CP Nông nghiệp Quốc tế Hoàng Anh Gia Lai",
  "Công ty CP Chăn nuôi C.P. Việt Nam", "Công ty TNHH Cargill Việt Nam",
  "Công ty CP GreenFeed Việt Nam", "Công ty TNHH Japfa Comfeed Việt Nam",
  "Công ty CP Việt Nam Kỹ nghệ Súc sản (Vissan)", "Công ty CP Dabaco Việt Nam",
  "Công ty CP Tập đoàn Pan (The PAN Group)", "Công ty CP Mía đường Thành Thành Công - Biên Hòa",
  "Công ty CP Đường Quảng Ngãi", "Công ty CP Mía đường Lam Sơn",
  "Công ty TNHH Unilever Việt Nam Quốc tế", "Công ty TNHH Procter & Gamble Việt Nam (P&G)",
  "Công ty TNHH Kimberly-Clark Việt Nam", "Công ty TNHH Colgate-Palmolive Việt Nam",
  "Công ty CP Dược phẩm Hậu Giang (DHG Pharma)", "Công ty CP Traphaco",
  "Công ty CP Dược phẩm Imexpharm", "Công ty CP Dược - Trang thiết bị Y tế Bình Định (Bidiphar)",
  "Công ty CP Dược phẩm Cửu Long", "Công ty CP Dược phẩm OPC",
  "Công ty TNHH Sanofi - Aventis Việt Nam", "Công ty TNHH Rohto-Mentholatum (Việt Nam)",
  "Hệ thống Nhà thuốc Long Châu", "Công ty CP Dược phẩm Pharmacity",
  "Công ty CP Bán lẻ An Khang", "Công ty TNHH Aeon Việt Nam",
  "Công ty TNHH Lotte Mart Việt Nam", "Công ty TNHH MM Mega Market Việt Nam",
  "Liên hiệp HTX Thương mại TP.HCM (Saigon Co.op)", "Tổng Công ty Thương mại Sài Gòn (Satra)",
  "Tổng Công ty Thương mại Hà Nội (Hapro)", "Công ty CP Dịch vụ Thương mại Tổng hợp VinCommerce",
  "Công ty TNHH Vòng Tròn Đỏ (Circle K)", "Công ty TNHH Cửa hàng Tiện lợi Gia đình (FamilyMart)",
  "Công ty CP Seven System Việt Nam (7-Eleven)", "Công ty TNHH GS25 Việt Nam",
  "Công ty CP Vàng Bạc Đá Quý Phú Nhuận (PNJ)", "Tập đoàn Vàng Bạc Đá Quý DOJI",
  "Công ty TNHH MTV Vàng Bạc Đá Quý Sài Gòn (SJC)", "Công ty TNHH Bảo Tín Minh Châu",
  "Công ty CP Tập đoàn Thiên Long", "Công ty CP Văn phòng phẩm Hồng Hà",
  "Công ty CP Tập đoàn Sunhouse", "Công ty CP Tập đoàn Kangaroo",
  "Công ty CP Tập đoàn Karofi", "Công ty CP Gỗ MDF VRG Dongwha",
  "Công ty TNHH MTV Phân đạm Dầu khí Cà Mau", "Công ty CP Phân bón Dầu khí Cà Mau",
  "Công ty Cổ phần Nước - Môi trường Bình Dương (Biwase)",
  "Công ty Cổ phần Cấp nước Nhà Bè", "Công ty Cổ phần Cấp nước Gia Định",
  "Công ty Cổ phần Cấp nước Trung An", "Công ty Cổ phần Cấp nước Chợ Lớn",
  "Công ty Cổ phần Cấp nước Phú Hòa Tân", "Công ty Cổ phần Cấp nước Bến Thành"
];

// =================================================================================================

const updateDuplicateCompanyNames = async () => {
    console.log('🔍 Scanning for duplicate company names...');

    const profiles = await RecruiterProfile.find({}).lean();
    const companyGroups = {};
    const existingNames = new Set();

    // Group by company name and populate existingNames
    for (const profile of profiles) {
        if (profile.company && profile.company.name) {
            const name = profile.company.name.trim();
            existingNames.add(name);
            
            if (!companyGroups[name]) {
                companyGroups[name] = [];
            }
            companyGroups[name].push(profile);
        }
    }

    let updatedCount = 0;
    const PROTECTED_COMPANY_ID = "68999927871b973f8605c8d6";
    
    let nameIndex = 0;

    for (const [name, group] of Object.entries(companyGroups)) {
        if (group.length > 1) {
            console.log(`\nFound ${group.length} companies with name "${name}":`);

            // Identify the main profile (protected one or the first one)
            let mainProfile = group.find(p => p.company._id.toString() === PROTECTED_COMPANY_ID);

            if (!mainProfile) {
                // If no protected profile, pick the first one as main (keep its name)
                mainProfile = group[0];
            }

            console.log(`   - Keeping "${name}" for Company ID: ${mainProfile.company._id} (Recruiter: ${mainProfile._id})`);

            // Filter out the main profile to get the list of duplicates to rename
            const duplicates = group.filter(p => p._id.toString() !== mainProfile._id.toString());

            for (let i = 0; i < duplicates.length; i++) {
                const profile = duplicates[i];
                let newName = '';
                
                // Find a unique name from the prepared array
                while(true) {
                    if (nameIndex < companyNames.length) {
                        const candidate = companyNames[nameIndex++];
                        if (!existingNames.has(candidate)) {
                            newName = candidate;
                            existingNames.add(newName); // Add to set to prevent reuse
                            break;
                        }
                    } else {
                        // Fallback if we run out of generated names
                        let suffixIndex = 1;
                        while(true) {
                             const candidate = `${name} ${suffixIndex}`;
                             if (!existingNames.has(candidate)) {
                                 newName = candidate;
                                 existingNames.add(newName);
                                 break;
                             }
                             suffixIndex++;
                        }
                        break;
                    }
                }

                console.log(`   - Renaming Company ID: ${profile.company._id} to "${newName}"`);

                await RecruiterProfile.updateOne(
                    { _id: profile._id },
                    { $set: { 'company.name': newName } }
                );
                updatedCount++;
            }
        }
    }

    console.log(`\n✅ Finished! Updated ${updatedCount} company names.`);
};

const main = async () => {
    await connectDB();
    await updateDuplicateCompanyNames();
    await mongoose.connection.close();
    console.log('✅ Connection closed');
    process.exit(0);
};

main();
