import copy
import unittest
from lua_pipeline.reference import category_of, reference_payload

class ReferenceTests(unittest.TestCase):
    def row(self):
        return {'name':'Laptop test','sourceUrl':'https://laptopaz.vn/laptop-test.html','offerUrl':'https://laptopaz.vn/laptop-test.html','externalOfferId':'001', 'observationId':'test','basePriceVnd':12000000,'reasons':['EXACT_VARIANT_UNMAPPED','STOCK_UNKNOWN'],'conflicts':[], 'attributes':{'RAM (Bộ nhớ trong)':'16GB DDR5','Storage (Ổ cứng)':'1TB SSD','Chipset':'Test CPU'}}
    def test_retailer_reference_is_separate_from_offer_approval(self):
        row=self.row();payload=reference_payload(row)
        self.assertTrue(payload['referenceEligible'])
        self.assertEqual(payload['category'],'pc_laptop')
        self.assertEqual(payload['specs']['ram'],'16GB DDR5')
        self.assertEqual(payload['specs']['storage'],'1TB SSD')
        self.assertNotIn('totalVnd',payload)
        self.assertEqual(row['reasons'],['EXACT_VARIANT_UNMAPPED','STOCK_UNKNOWN'])
    def test_identity_and_hardware_conflicts_remain_excluded(self):
        for reason in ['REGION_IDENTITY_CONFLICT','SPEC_CONFLICT:RAM','INVALID_JSON_LD']:
            row=self.row();row['reasons'].append(reason)
            self.assertFalse(reference_payload(row)['referenceEligible'])
    def test_price_conflict_can_preserve_hardware_without_publishing_price(self):
        row=self.row();row['reasons'].append('PRICE_CONFLICT')
        payload=reference_payload(row)
        self.assertTrue(payload['referenceEligible'])
        self.assertIsNone(payload['pricing']['current'])
        self.assertNotIn('totalVnd',payload)
    def test_missing_sku_stays_bound_to_reference_url_without_offer_approval(self):
        row=self.row();row['externalOfferId']='url:missing';row['reasons'].append('SOURCE_SKU_MISSING')
        self.assertTrue(reference_payload(row)['referenceEligible'])
    def test_category_filter_excludes_accessories_and_editorial_pages(self):
        for path in ['/op-lung-iphone-17','/tin-tuc/laptop-moi','/iphone-17-co-nen-mua','/linh-kien-laptop.html']:
            self.assertIsNone(category_of('https://shopdunk.com'+path))
        self.assertEqual(category_of('https://fptshop.com.vn/may-tinh-bang/ipad-air'),'tablet')
        self.assertEqual(category_of('https://fptshop.com.vn/dien-thoai/xiaomi-15'),'phone')
        self.assertEqual(category_of('https://laptopaz.vn/pc-gaming.html'),'pc_desktop')
        self.assertEqual(category_of('https://cellphones.com.vn/samsung-galaxy-tab-s11.html'),'tablet')
        self.assertEqual(category_of('https://cellphones.com.vn/samsung-galaxy-book-5.html'),'pc_laptop')
