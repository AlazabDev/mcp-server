# Google Cloud Platform MCP

## الغرض
إدارة موارد GCP المستخدمة فعليًا مثل Projects وIAM وCompute وStorage وLogs.

## Endpoint المقترح
`mcp.alazab.com/gcp`

## الاستخدام داخل العزب
يُستخدم هذا المجلد كمرجع وتشغيل وتطوير للتكامل الخاص بـ **Google Cloud Platform** داخل منظومة Alazab MCP.

## متغيرات البيئة
> تحفظ القيم الفعلية في `.env` ولا توضع داخل هذا الملف.

```env
GCP_PROJECT_ID=
GOOGLE_APPLICATION_CREDENTIALS=
GCP_REGION=
```

## الأدوات الأساسية المقترحة
- `list_projects`
- `list_resources`
- `inspect_iam`
- `inspect_compute`
- `inspect_storage`
- `inspect_logs`

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
