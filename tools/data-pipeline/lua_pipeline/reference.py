"""Retailer-bound reference catalog normalization, separate from offer approval."""
import re
import unicodedata
from urllib.parse import urlsplit


def folded(text):
    return ''.join(c for c in unicodedata.normalize('NFD', str(text).lower().replace('đ', 'd')) if unicodedata.category(c) != 'Mn')


def category_of(url, name=''):
    path = urlsplit(url).path.lower().strip('/')
    if any(part in path for part in ('/tin-tuc/', '/news/', '/bai-viet/', '/thu-thuat/')):
        return None
    if re.search(r'(?:^|/)(?:tin-tuc|news|blog|sforum|thu-thuat|phu-kien|linh-kien|op-lung|bao-da|sac|cap|chuot|ban-phim|man-hinh)(?:/|-|$)', path):
        return None
    slug = path.rsplit('/', 1)[-1]
    if re.search(r'(?:^|-)(?:cach|huong-dan|danh-gia|so-sanh|tin-don|loi|sua-loi|thay-pin|co-nen|bao-nhieu|la-gi)(?:-|$)', slug):
        return None
    if re.search(r'(?:^|/)(?:may-tinh-xach-tay|laptop|macbook|samsung-galaxy-book|huawei-matebook|honor-magicbook|xiaomi-book)(?:/|-|$)', path):
        return 'pc_laptop'
    if re.search(r'(?:^|/)(?:may-tinh-bang|tablet|ipad|apple-ipad|samsung-galaxy-tab|lenovo-tab|xiaomi-pad|redmi-pad|oppo-pad|honor-pad|huawei-matepad|google-pixel-tablet)(?:/|-|$)', path):
        return 'tablet'
    if re.search(r'(?:^|/)(?:may-tinh-de-ban|may-tinh-bo|pc|imac|mac-mini|mac-studio)(?:/|-|$)', path):
        return 'pc_desktop'
    if re.search(r'(?:^|/)(?:dtdd|dien-thoai|iphone|apple-iphone|samsung-galaxy|oppo|xiaomi|redmi|poco|vivo|realme|honor|nubia|nokia|tecno|infinix|huawei|google-pixel|asus-rog-phone)(?:/|-|\d|$)', path):
        return 'phone'
    title = folded(name)
    if re.match(r'^(?:laptop|macbook|may tinh xach tay)\b', title):
        return 'pc_laptop'
    if re.match(r'^(?:ipad|tablet|may tinh bang)\b', title):
        return 'tablet'
    if re.match(r'^(?:pc |imac|mac mini|mac studio|may tinh de ban)', title):
        return 'pc_desktop'
    if re.match(r'^(?:dien thoai|iphone|samsung galaxy|oppo|xiaomi|redmi|vivo|realme|honor|nokia)\b', title):
        return 'phone'
    return None


def reference_payload(row, category=None):
    attrs = {folded(k).strip().rstrip(':'): str(v).strip() for k, v in row.get('attributes', {}).items() if v}
    def attr(*keys):
        return next((attrs[k] for k in keys if attrs.get(k)), None)
    reasons = set(row.get('reasons', []))
    # Approval/mapping/availability gaps do not invent hardware or a payable offer.
    reference_only_gaps = {'EXACT_VARIANT_UNMAPPED', 'CONDITION_UNKNOWN', 'STOCK_UNKNOWN', 'SOURCE_SKU_MISSING',
        'PRICE_UNRESOLVED','PRICE_CONFLICT','DOM_PRICE_AMBIGUOUS','AGGREGATE_OR_UNKNOWN_OFFER',
        'CURRENCY_NOT_VND','PRICE_CONTEXT_REVIEW_REQUIRED','PRICE_VALIDITY_EXPIRED'}
    hardware_fields = {'ram','dung luong ram','ram (bo nho trong)','bo nho ram','o cung','storage','storage (o cung)',
        'bo nho trong','cpu','chipset','chip xu ly','loai cpu','he dieu hanh','gpu','card do hoa'}
    other_spec_conflicts = {r for r in reasons if r.startswith('SPEC_CONFLICT:') and folded(r.split(':',1)[1]) not in hardware_fields}
    # A source URL can identify a reference listing; it does not establish an approved exact offer.
    eligible = not (reasons - reference_only_gaps - other_spec_conflicts)
    price_unknown = any(r in reasons for r in {'PRICE_UNRESOLVED','PRICE_CONFLICT','DOM_PRICE_AMBIGUOUS',
        'AGGREGATE_OR_UNKNOWN_OFFER','CURRENCY_NOT_VND','PRICE_CONTEXT_REVIEW_REQUIRED','PRICE_VALIDITY_EXPIRED'})
    return {
        'name': row['name'], 'url': row['offerUrl'],
        'category': category or category_of(row['sourceUrl'], row['name']),
        'brand': attr('thuong hieu', 'brand', 'hang san xuat', 'hang'),
        'specs': {
            'ram': attr('ram', 'dung luong ram', 'ram (bo nho trong)', 'bo nho ram'),
            'storage': attr('o cung', 'storage', 'storage (o cung)', 'bo nho trong', 'dung luong luu tru', 'dung luong o cung'),
            'cpu': attr('cpu', 'chipset', 'chip xu ly', 'bo vi xu ly', 'cong nghe cpu', 'loai cpu'),
            'os': attr('he dieu hanh', 'he dieu hanh khi ra mat', 'os'),
            'gpu': attr('gpu', 'card do hoa', 'chip do hoa'),
        },
        'pricing': {'current': None if price_unknown else row['basePriceVnd']},
        'pipelineObservationId': row['observationId'],
        'referenceEligible': eligible,
        'qualityReasons': sorted(reasons),
    }
