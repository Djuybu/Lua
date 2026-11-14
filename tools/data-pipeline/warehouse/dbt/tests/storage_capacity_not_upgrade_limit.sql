with samples(description,expected) as (values
 ('512GB SSD (up to 1TB)',512),
 ('1 TB SSD M.2 PCIe (up to 2 TB)',1024),
 ('Hỗ trợ thêm 1 khe SSD (nâng cấp tối đa 2 TB) 512 GB SSD NVMe',512),
 ('•512 GB SSD M.2 (up to 1 TB)•one extra slot',512),
 ('eMMC 32 GB',32),
 ('256GB',256),
 ('Up to 2 TB',null::integer),
 ('Unknown',null::integer)
)
select * from samples where {{ storage_gb('description') }} is distinct from expected
