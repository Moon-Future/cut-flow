import demoProjectJson from '../../projects/demo-project/project.json';
import {projectFileSchema} from '../core/schema';

export const demoProject = projectFileSchema.parse(demoProjectJson);
