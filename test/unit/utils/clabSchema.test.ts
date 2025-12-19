/* eslint-env mocha */
/* global describe, it */
import { expect } from 'chai';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import fs from 'fs';
import path from 'path';

describe('clab.schema.json', () => {
  it('compiles with custom markdownDescription keyword', () => {
    // Go up from out/test/test/unit/utils to project root, then into schema/
    const schemaPath = path.join(__dirname, '..', '..', '..', '..', '..', 'schema', 'clab.schema.json');
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    const ajv = new Ajv({ strict: false, allErrors: true, verbose: true });
    addFormats(ajv);
    ajv.addKeyword({
      keyword: 'markdownDescription',
      schemaType: 'string',
      compile: () => () => true,
    });
    const validate = ajv.compile(schema);
    expect(validate).to.be.a('function');
  });
});
