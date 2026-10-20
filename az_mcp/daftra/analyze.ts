import * as fs from 'fs';
import * as path from 'path';

interface SwaggerDoc {
  paths?: Record<string, Record<string, any>>;
  components?: {
    schemas?: Record<string, any>;
  };
}

function analyzeSwagger() {
  const filePath = path.join(process.cwd(), 'daftra.openapi.json');
  if (!fs.existsSync(filePath)) {
    console.error('Error: daftra.openapi.json not found!');
    process.exit(1);
  }

  console.log('Reading OpenAPI file...');
  const rawData = fs.readFileSync(filePath, 'utf-8');
  const swagger: SwaggerDoc = JSON.parse(rawData);

  const paths = swagger.paths || {};
  const modules: Record<string, { totalEndpoints: number; operations: Array<{ method: string; path: string; summary?: string }> }> = {};
  
  let totalOperations = 0;

  for (const [pathUrl, methods] of Object.entries(paths)) {
    for (const [method, details] of Object.entries(methods)) {
      if (['get', 'post', 'put', 'delete', 'patch'].includes(method.toLowerCase())) {
        totalOperations++;
        
        // استخراج اسم الموديول من المسار (مثلاً /v2/api/entity/invoices -> invoices)
        const segments = pathUrl.split('/').filter(Boolean);
        let moduleName = 'general';
        
        if (segments.length > 0) {
          // استبعاد بادئات النسخ مثل v2 أو api
          const filteredSegments = segments.filter(s => !['v2', 'api', 'rest'].includes(s.toLowerCase()));
          moduleName = filteredSegments[0] || 'general';
        }

        if (!modules[moduleName]) {
          modules[moduleName] = { totalEndpoints: 0, operations: [] };
        }

        modules[moduleName].totalEndpoints++;
        modules[moduleName].operations.push({
          method: method.toUpperCase(),
          path: pathUrl,
          summary: details.summary || details.operationId || ''
        });
      }
    }
  }

  const schemasCount = Object.keys(swagger.components?.schemas || {}).length;

  console.log('\n======================================');
  console.log('       DAFTRA API ANALYSIS REPORT     ');
  console.log('======================================');
  console.log(`Total Operations (Endpoints): ${totalOperations}`);
  console.log(`Total Schemas (Models): ${schemasCount}`);
  console.log(`Total Identified Modules: ${Object.keys(modules).length}\n`);

  console.log('Breakdown by Module:');
  console.log('--------------------------------------');
  const sortedModules = Object.entries(modules).sort((a, b) => b[1].totalEndpoints - a[1].totalEndpoints);

  for (const [modName, data] of sortedModules) {
    console.log(`• [${modName.toUpperCase()}] -> ${data.totalEndpoints} endpoints`);
  }

  // حفظ تقرير مجمع في ملف JSON نستخدمه لاحقاً في الـ MCP
  const summaryReport = {
    totalOperations,
    totalSchemas: schemasCount,
    modulesCount: Object.keys(modules).length,
    modules
  };

  fs.writeFileSync('api_summary.json', JSON.stringify(summaryReport, null, 2));
  console.log('\nSummary saved to: api_summary.json');
}

analyzeSwagger();
