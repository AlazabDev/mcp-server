# Supabase MCP

## الغرض
إدارة مشاريع Supabase وSQL وSchemas وRLS وAuth وStorage وEdge Functions وMigrations وLogs.

## Endpoint المقترح
`mcp.alazab.com/supabase`

## الاستخدام داخل العزب
يُستخدم هذا المجلد كمرجع وتشغيل وتطوير للتكامل الخاص بـ **Supabase** داخل منظومة Alazab MCP.

## متغيرات البيئة
> تحفظ القيم الفعلية في `.env` ولا توضع داخل هذا الملف.

```env
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_ACCESS_TOKEN=
SUPABASE_PROJECT_REF=
```

## الأدوات الأساسية المقترحة
- `execute_sql`
- `inspect_schema`
- `list_tables`
- `inspect_rls`
- `list_functions`
- `inspect_auth`
- `list_storage`
- `apply_migration`

## الهيكل المقترح
```text
README.md
.env.example
src/
  index.ts
  config.ts
  tools/
  services/
  types/
tests/
docs/
```

## قواعد التطوير
- لا يتم تكرار Business Logic موجود أصلًا في النظام المصدر.
- الـMCP يكون طبقة أدوات واضحة وخفيفة فوق الـAPI أو الخدمة الأصلية.
- كل Tool يجب أن يكون له اسم واضح وInput/Output Schema محدد.
- توثق أي إضافة جديدة في هذا الملف.
- عند وجود عمليات قراءة وكتابة، يفضل الفصل بينها منطقيًا داخل الأدوات.

## السجلات والمراقبة
يُسجل على الأقل:
- اسم الأداة.
- المورد أو الكيان المستهدف.
- وقت التنفيذ.
- النتيجة أو الخطأ.
- مدة التنفيذ.

## الحالة
`INITIAL DOCUMENTATION`

## المطلوب استكماله
- حصر الأدوات الفعلية الموجودة في الكود.
- توثيق الـAPI/SDK الحقيقي المستخدم.
- إضافة أمثلة تشغيل.
- إضافة health check.
- إضافة اختبارات أساسية.
- تحديث هذا الملف بعد كل تغيير معماري أو Tool جديد.
