import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

/** Mascota animada del login: 'duo' = los dos cachorros dándose la mano (sin usuario
 *  identificado o admin); 'leoncito' / 'realzza' = el cachorro de esa marca jugando con su logo.
 *  El login le pone las clases 'atento' (foco en Usuario) y 'discreto' (foco en Contraseña). */
@Component({
  selector: 'app-login-mascota',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './login-mascota.component.html',
  styleUrl: './login-mascota.component.css'
})
export class LoginMascotaComponent {
  @Input() modo: 'duo' | 'leoncito' | 'realzza' = 'duo';
  @Input() nombre = '';
  @Input() salta = false;

  get cubBase(): string {
    return this.modo === 'realzza' ? '/img/realzza-cub' : '/img/leoncito-cub';
  }
  get logoSrc(): string {
    return this.modo === 'realzza' ? '/img/realzza-motos-blanco.png' : '/img/leoncito-logo.webp';
  }
}
