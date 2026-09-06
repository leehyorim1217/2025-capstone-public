// data/equipmentMasterData.js - Samsung Galaxy Tab 추가 버전

const equipmentCategories = {
  laptop: { name: '노트북', icon: '' },
  camera: { name: '카메라', icon: '' },
  tablet: { name: '태블릿', icon: '' },
  monitor: { name: '모니터', icon: '' },
  projector: { name: '프로젝터', icon: '' },
  drone: { name: '드론', icon: '' },
  equipment: { name: '기타 장비', icon: '' }
};

const equipmentDatabase = [
  //  테스트 중인 Samsung Galaxy Tab 추가
  {
    id: 'TAB002',
    name: 'Samsung Galaxy Tab S9',
    brand: 'Samsung',
    model: 'SM-TAB2024',  // AI가 인식한 모델
    category: 'tablet',
    serialNumber: 'SN202510209522',  //  AI가 인식한 시리얼 번호
    status: 'available',
    image: '/images/equipment/galaxy-tab.jpg',
    specs: { screen: '11"', processor: 'Snapdragon 8 Gen 2', storage: '128GB' },
    purchaseDate: '2024-10-20',
    currentUser: null,
    rentalHistory: [],
    aiKeywords: ['samsung', 'galaxy', 'tab', 'tablet', 'android']
  },

  // 노트북
  {
    id: 'LAP001',
    name: 'MacBook Pro 16" M3',
    brand: 'Apple',
    model: 'MacBook Pro 16',
    category: 'laptop',
    serialNumber: 'MBP16M3001',
    status: 'available',
    image: '/images/equipment/macbook-pro.jpg',
    specs: { processor: 'M3 Max', ram: '32GB', storage: '1TB SSD' },
    purchaseDate: '2024-01-15',
    currentUser: null,
    rentalHistory: [],
    aiKeywords: ['macbook', 'apple', 'laptop', 'm3', 'pro']
  },
  {
    id: 'LAP002',
    name: 'ThinkPad X1 Carbon Gen 11',
    brand: 'Lenovo',
    model: 'X1 Carbon',
    category: 'laptop',
    serialNumber: 'TPX1C11001',
    status: 'available',
    image: '/images/equipment/thinkpad.jpg',
    specs: { processor: 'i7-1355U', ram: '16GB', storage: '512GB SSD' },
    purchaseDate: '2024-02-01',
    currentUser: null,
    rentalHistory: [],
    aiKeywords: ['thinkpad', 'lenovo', 'laptop', 'x1', 'carbon']
  },

  // 카메라
  {
    id: 'CAM001',
    name: 'Canon EOS R5',
    brand: 'Canon',
    model: 'EOS R5',
    category: 'camera',
    serialNumber: 'CANR5001',
    status: 'available',
    image: '/images/equipment/canon-r5.jpg',
    specs: { resolution: '45MP', video: '8K', sensor: 'Full Frame' },
    purchaseDate: '2023-12-10',
    currentUser: null,
    rentalHistory: [],
    aiKeywords: ['canon', 'camera', 'eos', 'r5', 'mirrorless']
  },
  {
    id: 'CAM002',
    name: 'Sony A7 IV',
    brand: 'Sony',
    model: 'A7 IV',
    category: 'camera',
    serialNumber: 'SNYA7IV001',
    status: 'available',
    image: '/images/equipment/sony-a7iv.jpg',
    specs: { resolution: '33MP', video: '4K 60fps', sensor: 'Full Frame' },
    purchaseDate: '2024-01-20',
    currentUser: null,
    rentalHistory: [],
    aiKeywords: ['sony', 'camera', 'a7', 'alpha', 'mirrorless']
  },

  // 태블릿
  {
    id: 'TAB001',
    name: 'iPad Pro 12.9" M2',
    brand: 'Apple',
    model: 'iPad Pro 12.9',
    category: 'tablet',
    serialNumber: 'IPADPRO001',
    status: 'available',
    image: '/images/equipment/ipad-pro.jpg',
    specs: { screen: '12.9"', processor: 'M2', storage: '256GB' },
    purchaseDate: '2024-03-01',
    currentUser: null,
    rentalHistory: [],
    aiKeywords: ['ipad', 'apple', 'tablet', 'pro', 'm2']
  },

  // 모니터
  {
    id: 'MON001',
    name: 'LG UltraFine 5K',
    brand: 'LG',
    model: 'UltraFine 27MD5KL',
    category: 'monitor',
    serialNumber: 'LGUF5K001',
    status: 'available',
    image: '/images/equipment/lg-ultrafine.jpg',
    specs: { size: '27"', resolution: '5K', panel: 'IPS' },
    purchaseDate: '2023-11-15',
    currentUser: null,
    rentalHistory: [],
    aiKeywords: ['lg', 'monitor', 'ultrafine', '5k', 'display']
  }
];

// ========== AI 결과 기반 장비 매칭 ==========
const findEquipmentByAIResult = (aiResult) => {
  console.log(' AI 결과 기반 장비 매칭 시작');
  
  if (!aiResult || !aiResult.equipment) {
    console.log(' AI 결과 없음');
    return { matched: false, suggestions: [] };
  }
  
  const aiEquipment = aiResult.equipment;
  const type = aiEquipment.type || aiEquipment.category;
  const serial = aiResult.serialNumber || aiResult.serial_number || aiEquipment.serial;
  const brand = aiEquipment.manufacturer || aiEquipment.brand;
  const model = aiEquipment.model;
  
  console.log(' 매칭 정보:', { type, serial, brand, model });
  
  // 1⃣ 시리얼 번호 정확 매칭
  if (serial && serial !== '인식 실패') {
    const exactMatch = equipmentDatabase.find(equipment => 
      equipment.serialNumber.toLowerCase() === serial.toLowerCase()
    );
    
    if (exactMatch) {
      console.log(' 시리얼 번호 정확 매칭:', exactMatch.name);
      return {
        matched: true,
        equipment: exactMatch,
        matchType: 'serial_exact',
        confidence: 0.95
      };
    }
  }
  
  // 2⃣ 브랜드 + 모델 매칭
  if (brand && model) {
    const brandModelMatch = equipmentDatabase.find(equipment => {
      const brandMatch = equipment.brand.toLowerCase().includes(brand.toLowerCase());
      const modelMatch = equipment.model.toLowerCase().includes(model.toLowerCase());
      return brandMatch && modelMatch;
    });
    
    if (brandModelMatch) {
      console.log(' 브랜드+모델 매칭:', brandModelMatch.name);
      return {
        matched: true,
        equipment: brandModelMatch,
        matchType: 'brand_model',
        confidence: 0.85
      };
    }
  }
  
  // 3⃣ 브랜드만 매칭 (Samsung + tablet 조합)
  if (brand) {
    const brandMatches = equipmentDatabase.filter(equipment => 
      equipment.brand.toLowerCase() === brand.toLowerCase() &&
      equipment.status === 'available' &&
      equipment.category === type
    );
    
    if (brandMatches.length === 1) {
      console.log(' 브랜드 단독 매칭:', brandMatches[0].name);
      return {
        matched: true,
        equipment: brandMatches[0],
        matchType: 'brand_single',
        confidence: 0.75
      };
    } else if (brandMatches.length > 1) {
      console.log(' 브랜드 매칭 여러 개:', brandMatches.length);
      return {
        matched: false,
        suggestions: brandMatches.slice(0, 5),
        matchType: 'brand_multiple',
        confidence: 0.7
      };
    }
  }
  
  // 4⃣ 카테고리 기반 제안
  const categoryEquipments = equipmentDatabase.filter(equipment => 
    equipment.category === type && equipment.status === 'available'
  );
  
  if (categoryEquipments.length > 0) {
    console.log(' 카테고리 기반 제안:', categoryEquipments.length);
    return {
      matched: false,
      suggestions: categoryEquipments.slice(0, 5),
      matchType: 'category_suggestion',
      confidence: 0.6
    };
  }
  
  console.log(' 매칭 실패');
  return { matched: false, suggestions: [] };
};

// ========== 장비 검색 ==========
const searchEquipment = (query, category = null) => {
  if (!query || query.length < 2) {
    return category ? 
      equipmentDatabase.filter(eq => eq.category === category) :
      equipmentDatabase;
  }
  
  const searchQuery = query.toLowerCase();
  
  return equipmentDatabase.filter(equipment => {
    if (category && equipment.category !== category) {
      return false;
    }
    
    const matchFields = [
      equipment.name,
      equipment.brand,
      equipment.model,
      equipment.serialNumber,
      equipment.category,
      ...equipment.aiKeywords
    ];
    
    return matchFields.some(field => 
      field && field.toLowerCase().includes(searchQuery)
    );
  });
};

// ========== 장비 상태 업데이트 ==========
const updateEquipmentStatus = (equipmentId, newStatus, userId = null) => {
  const equipment = equipmentDatabase.find(eq => eq.id === equipmentId);
  
  if (!equipment) {
    console.error(' 장비를 찾을 수 없음:', equipmentId);
    return false;
  }
  
  const oldStatus = equipment.status;
  equipment.status = newStatus;
  
  if (newStatus === 'rented' && userId) {
    equipment.currentUser = userId;
    equipment.rentalHistory.push({
      userId,
      startDate: new Date().toISOString(),
      endDate: null,
      status: 'active'
    });
  } else if (newStatus === 'available') {
    if (equipment.currentUser) {
      const activeRental = equipment.rentalHistory.find(
        rental => rental.status === 'active'
      );
      if (activeRental) {
        activeRental.endDate = new Date().toISOString();
        activeRental.status = 'completed';
      }
    }
    equipment.currentUser = null;
  }
  
  console.log(` 장비 상태 변경: ${equipment.name} ${oldStatus} -> ${newStatus}`);
  return true;
};

// ========== 기타 유틸리티 함수 ==========
const getEquipmentById = (equipmentId) => {
  return equipmentDatabase.find(eq => eq.id === equipmentId);
};

const getAvailableEquipments = () => {
  return equipmentDatabase.filter(eq => eq.status === 'available');
};

const getEquipmentStats = () => {
  const stats = {};
  
  Object.keys(equipmentCategories).forEach(category => {
    const categoryEquipments = equipmentDatabase.filter(eq => eq.category === category);
    
    stats[category] = {
      total: categoryEquipments.length,
      available: categoryEquipments.filter(eq => eq.status === 'available').length,
      rented: categoryEquipments.filter(eq => eq.status === 'rented').length,
      maintenance: categoryEquipments.filter(eq => eq.status === 'maintenance').length,
      broken: categoryEquipments.filter(eq => eq.status === 'broken').length
    };
  });
  
  return stats;
};

const getCurrentRentals = () => {
  return equipmentDatabase.filter(eq => eq.status === 'rented');
};

const getUserRentalHistory = (userId) => {
  const userRentals = [];
  
  equipmentDatabase.forEach(equipment => {
    equipment.rentalHistory.forEach(rental => {
      if (rental.userId === userId) {
        userRentals.push({
          ...rental,
          equipment: {
            id: equipment.id,
            name: equipment.name,
            category: equipment.category,
            image: equipment.image
          }
        });
      }
    });
  });
  
  return userRentals.sort((a, b) => new Date(b.startDate) - new Date(a.startDate));
};

// ========== Export ==========
module.exports = {
  equipmentDatabase,
  equipmentCategories,
  findEquipmentByAIResult,
  searchEquipment,
  updateEquipmentStatus,
  getEquipmentById,
  getAvailableEquipments,
  getEquipmentStats,
  getCurrentRentals,
  getUserRentalHistory
};

console.log(' equipmentMasterData 모듈 로드 완료');
console.log(` 장비 데이터베이스: ${equipmentDatabase.length}개 장비 등록됨`);