import fs from 'fs';

const filePath = '/app/applet/components/accounting/NewExpenseModal.tsx';
let content = fs.readFileSync(filePath, 'utf-8');

content = content.replace(
  /source: formData\.source,\n\s*status: TransactionStatus\.COMPLETED,\n\s*search_text: ocrText\n\s*}, file \|\| undefined\);/,
  `source: formData.source,
        status: TransactionStatus.COMPLETED,
        search_text: ocrText,
        created_by: currentUser?.id
      }, file || undefined);`
);

fs.writeFileSync(filePath, content);
console.log('Fixed NewExpenseModal.tsx');
