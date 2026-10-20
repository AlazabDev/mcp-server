# Storage MCP

## الغرض
طبقة موحدة للتعامل مع الملفات والتخزين عبر MinIO وR2 وSupabase Storage وSeafile والتخزين المحلي.

## Endpoint المقترح
`mcp.alazab.com/storage`

## الاستخدام داخل العزب
يُستخدم هذا المجلد كمرجع وتشغيل وتطوير للتكامل الخاص بـ **Storage** داخل منظومة Alazab MCP.

## متغيرات البيئة
> تحفظ القيم الفعلية في `.env` ولا توضع داخل هذا الملف.

```env
STORAGE_PROVIDER=
STORAGE_ENDPOINT=
STORAGE_ACCESS_KEY=
STORAGE_SECRET_KEY=
STORAGE_BUCKET=
```

## الأدوات الأساسية المقترحة
- `list_objects`
- `get_object`
- `upload_object`
- `move_object`
- `copy_object`
- `delete_object`
- `create_signed_url`

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
