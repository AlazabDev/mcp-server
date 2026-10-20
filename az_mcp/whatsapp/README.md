# WhatsApp / Meta MCP

## الغرض
إدارة الرسائل والقوالب والوسائط والـwebhooks والأرقام وحالات الرسائل عبر WhatsApp/Meta.

## Endpoint المقترح
`mcp.alazab.com/whatsapp`

## الاستخدام داخل العزب
يُستخدم هذا المجلد كمرجع وتشغيل وتطوير للتكامل الخاص بـ **WhatsApp / Meta** داخل منظومة Alazab MCP.

## متغيرات البيئة
> تحفظ القيم الفعلية في `.env` ولا توضع داخل هذا الملف.

```env
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=
WHATSAPP_VERIFY_TOKEN=
```

## الأدوات الأساسية المقترحة
- `send_message`
- `send_template`
- `send_media`
- `get_media`
- `get_message_status`
- `list_templates`
- `list_phone_numbers`

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
