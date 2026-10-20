# Azure MCP

## الغرض
إدارة موارد Azure العامة مثل الاشتراكات وResource Groups وRBAC والشبكات والخدمات العامة.

## Endpoint المقترح
`mcp.alazab.com/azure`

## الاستخدام داخل العزب
يُستخدم هذا المجلد كمرجع وتشغيل وتطوير للتكامل الخاص بـ **Azure** داخل منظومة Alazab MCP.

## متغيرات البيئة
> تحفظ القيم الفعلية في `.env` ولا توضع داخل هذا الملف.

```env
AZURE_SUBSCRIPTION_ID=
AZURE_TENANT_ID=
AZURE_CLIENT_ID=
AZURE_CLIENT_SECRET=
```

## الأدوات الأساسية المقترحة
- `list_resources`
- `get_resource`
- `list_resource_groups`
- `get_role_assignments`
- `inspect_subscription`

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
