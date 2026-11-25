import tempfile
from pathlib import Path
import unittest
from scripts.crawl_inventory import Queue, parse_sitemap, sitemap_allowed

class InventoryTests(unittest.TestCase):
    def test_monthly_product_indexes_are_not_mistaken_for_news(self):
        for source,host in [('tgdd','www.thegioididong.com'),('dienmayxanh','www.dienmayxanh.com')]:
            self.assertTrue(sitemap_allowed(source,f'https://{host}/newsitemap/sitemap-product-2026-11?page=1'))
        self.assertFalse(sitemap_allowed('laptopaz','https://laptopaz.vn/sitemap_article.xml'))
        self.assertFalse(sitemap_allowed('fptshop','https://fptshop.com.vn/products/sitemap-tu-lanh.xml'))
    def test_full_discovery_keeps_all_scoped_children_and_deduplicates(self):
        with tempfile.TemporaryDirectory() as tmp:
            q=Queue(Path(tmp)/'queue.sqlite')
            body='<sitemapindex>'+''.join(f'<sitemap><loc>https://cellphones.com.vn/sitemap/product-sitemap{i}.xml</loc></sitemap>' for i in range(70))+'</sitemapindex>'
            for _ in range(2): parse_sitemap('cellphones',{'body':body},q)
            self.assertEqual(q.db.execute('select count(*) from tasks').fetchone()[0],70)
            q.db.close()
    def test_product_discovery_rejects_external_hosts_and_accessories(self):
        with tempfile.TemporaryDirectory() as tmp:
            q=Queue(Path(tmp)/'queue.sqlite')
            body='<urlset><url><loc>https://fptshop.com.vn/dien-thoai/test</loc></url><url><loc>https://evil.example/dien-thoai/test</loc></url><url><loc>https://fptshop.com.vn/op-lung-iphone-17</loc></url></urlset>'
            result=parse_sitemap('fptshop',{'body':body},q)
            self.assertEqual(result['candidateProducts'],1)
            self.assertEqual(result['outOfScope'],2)
            self.assertEqual(q.next('fptshop','product')[0],'https://fptshop.com.vn/dien-thoai/test')
            q.finish('fptshop','https://fptshop.com.vn/dien-thoai/test','done',1,1)
            self.assertIsNone(q.next('fptshop','product'))
            q.db.close()
