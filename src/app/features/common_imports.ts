import { MatInputModule } from '@angular/material/input';
import { CommonModule } from '@angular/common';
import { MatFormFieldModule } from '@angular/material/form-field';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { CONST_MATERIAL_COMPONENTS } from './material_imports';

export const SHARED_MATERIAL_IMPORTS = [
    ...CONST_MATERIAL_COMPONENTS,
    CommonModule,
    FormsModule,
    MatFormFieldModule,
    ReactiveFormsModule,
    MatInputModule
];