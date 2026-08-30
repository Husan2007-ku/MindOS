with open('alembic/versions/0001_initial.py', 'r') as f:
    c = f.read()
idx = c.find('"subscriptions"')
first = c.find('updated_at', idx)
second = c.find('updated_at', first + 1)
if second > 0:
    ls = c.rfind('\n', 0, second)
    le = c.find('\n', second)
    c = c[:ls] + c[le:]
    print('Ikkinchi updated_at ochirildi')
else:
    print('Ikkinchi updated_at topilmadi')
with open('alembic/versions/0001_initial.py', 'w') as f:
    f.write(c)
