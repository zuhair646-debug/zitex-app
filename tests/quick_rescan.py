"""Quick re-scan of the screens fixed after pass 5."""
import asyncio, sys
sys.argv = [sys.argv[0], 'ar,zh,he,bn,ur,es']
import importlib.util
spec = importlib.util.spec_from_file_location('scan', '/app/tests/full_lang_scan.py')
src = open('/app/tests/full_lang_scan.py').read().replace('asyncio.run(main())', '')
ns = {}
exec(compile(src, 'scan', 'exec'), ns)
ns['ROLES'] = {
    'customer': ('0500000000', 'test1234', ['/support', '/social', 'SERVICE', 'PRODUCT', '/about-store', '/competitions']),
    'merchant': ('0509999999', 'merchant2025', ['/merchant/services', '/merchant/customers', '/merchant/employees', '/merchant/drivers',
                 '/merchant/more', '/merchant/support-settings', '/merchant/social', '/merchant/competitions', '/merchant/returns']),
    'chamber': ('0550000000', 'chamber2025', ['/chamber']),
    'cashier': ('0530000001', 'emp1234', ['/merchant']),
}
asyncio.run(ns['main']())
