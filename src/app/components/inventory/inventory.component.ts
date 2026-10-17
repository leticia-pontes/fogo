import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Output,
  PLATFORM_ID,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideDynamicIcon } from '@lucide/angular';
import { v4 as uuidv4 } from 'uuid';
import { DeviceInventoryService } from '../../services/device-inventory.service';
import { StoryService } from '../../services/story.service';
import {
  CameraDevice,
  CityDevice,
  DeviceCategory,
  DeviceStatus,
  FieldAgent,
  GenericIoTDevice,
  MaintenanceUrgency,
  RadarDevice,
} from '../../models/fogo.models';

export type StatusChipFilter =
  | 'all'
  | 'unverified'
  | 'operational'
  | 'malfunction'
  | 'stolen'
  | 'immediate_urgency'
  | 'maintenance';

@Component({
  selector: 'app-inventory',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideDynamicIcon],
  template: `
    <div class="p-4 lg:p-6 space-y-5 max-w-[1560px] mx-auto text-[#e9e4d8]">
      <!-- Cabeçalho da Barreira 1 e Controles de Busca -->
      <section class="bg-[#1a2124] border border-[#2a3439] rounded-xl p-5 space-y-4">
        <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div class="space-y-1">
            <div class="flex flex-wrap items-center gap-3 text-sm text-[#a39e93]">
              <span>Barreira 1 — Reconhecer o que existe</span>
              <span>•</span>
              <span>
                Verificados:
                <strong class="text-[#e9e4d8]">
                  {{ story.verifiedDeviceIds().length }} de {{ inventory.totalDevices() }} ({{ story.verifiedPercentage() }}%)
                </strong>
              </span>
              @if (!story.barrierOneCleared()) {
                <span class="text-[#ff7a3d] font-medium">Meta da barreira: 60%</span>
              } @else {
                <span class="text-[#4ca975] font-medium">✓ Meta de 60% atingida</span>
              }
            </div>
            <h1 class="text-xl font-semibold text-[#e9e4d8]">
              Inventário de equipamentos e agentes de campo
            </h1>
          </div>

          <div class="flex flex-wrap items-center gap-2.5">
            <!-- Alternador Equipamentos / Agentes -->
            <div class="inline-flex rounded-lg bg-[#101517] p-1 border border-[#2a3439]" role="tablist">
              <button
                type="button"
                role="tab"
                [attr.aria-selected]="activeEntityTab() === 'devices'"
                (click)="activeEntityTab.set('devices')"
                [class]="activeEntityTab() === 'devices'
                  ? 'px-3.5 py-1.5 text-sm font-medium rounded-md bg-[#1a2124] text-[#e9e4d8] border border-[#2a3439]'
                  : 'px-3.5 py-1.5 text-sm text-[#a39e93] hover:text-[#e9e4d8]'"
              >
                Equipamentos ({{ inventory.totalDevices() }})
              </button>
              <button
                type="button"
                role="tab"
                [attr.aria-selected]="activeEntityTab() === 'agents'"
                (click)="activeEntityTab.set('agents')"
                [class]="activeEntityTab() === 'agents'
                  ? 'px-3.5 py-1.5 text-sm font-medium rounded-md bg-[#1a2124] text-[#e9e4d8] border border-[#2a3439]'
                  : 'px-3.5 py-1.5 text-sm text-[#a39e93] hover:text-[#e9e4d8]'"
              >
                Agentes em campo ({{ inventory.agents().length }})
              </button>
            </div>

            <button
              type="button"
              (click)="openRegistrationModal()"
              class="px-4 py-2 rounded-lg bg-[#ff7a3d] hover:bg-[#ff8b55] text-[#101517] font-semibold text-sm flex items-center gap-2 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#ff7a3d]"
            >
              <svg lucideIcon="plus-circle" class="w-4 h-4"></svg>
              Cadastrar equipamento
            </button>
          </div>
        </div>

        <!-- Barra de progresso da Barreira 1 -->
        <div class="w-full h-2 bg-[#101517] rounded-full overflow-hidden" aria-hidden="true">
          <div
            class="h-full transition-all duration-300"
            [style.width.%]="story.verifiedPercentage()"
            [class]="story.barrierOneCleared() ? 'bg-[#4ca975]' : 'bg-[#ff7a3d]'"
          ></div>
        </div>

        <!-- Busca e Seletores -->
        <div class="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div class="md:col-span-7 relative">
            <svg
              lucideIcon="search"
              class="w-4 h-4 text-[#a39e93] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
            ></svg>
            <input
              type="text"
              [ngModel]="searchQuery()"
              (ngModelChange)="searchQuery.set($event)"
              placeholder="Buscar por número de série, rua, bairro, fabricante ou modelo..."
              aria-label="Buscar equipamentos ou agentes"
              class="w-full pl-10 pr-16 py-2.5 bg-[#101517] border border-[#2a3439] focus:border-[#ff7a3d] rounded-lg text-sm text-[#e9e4d8] placeholder-[#78756e] outline-none"
            />
            @if (searchQuery()) {
              <button
                type="button"
                (click)="searchQuery.set('')"
                class="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#a39e93] hover:text-[#e9e4d8]"
              >
                Limpar
              </button>
            }
          </div>

          <div class="md:col-span-3">
            <select
              [ngModel]="selectedCategory()"
              (ngModelChange)="selectedCategory.set($event)"
              aria-label="Filtrar por categoria de equipamento"
              class="w-full py-2.5 px-3 bg-[#101517] border border-[#2a3439] focus:border-[#ff7a3d] rounded-lg text-sm text-[#e9e4d8] outline-none"
            >
              <option value="all">Todas as categorias (9 tipos)</option>
              <option value="radar">Radar de fiscalização</option>
              <option value="camera">Câmera de monitoramento</option>
              <option value="truck_scale">Balança de pesagem dinâmica</option>
              <option value="autonomous_patrol">Patrulha autônoma</option>
              <option value="automated_barrier">Cancela automatizada</option>
              <option value="transit_vehicle">Veículo de transporte / BRT</option>
              <option value="parking_totem">Totem de estacionamento</option>
              <option value="shared_micromobility">Micromobilidade compartilhada</option>
              <option value="police_vehicle">Viatura operacional</option>
            </select>
          </div>

          <div class="md:col-span-2">
            <select
              [ngModel]="selectedNeighborhood()"
              (ngModelChange)="selectedNeighborhood.set($event)"
              aria-label="Filtrar por bairro"
              class="w-full py-2.5 px-3 bg-[#101517] border border-[#2a3439] focus:border-[#ff7a3d] rounded-lg text-sm text-[#e9e4d8] outline-none"
            >
              <option value="all">Todos os bairros</option>
              @for (neighborhood of neighborhoodsList(); track neighborhood) {
                <option [value]="neighborhood">{{ neighborhood }}</option>
              }
            </select>
          </div>
        </div>

        <!-- Filtros rápidos por chips com símbolos acessíveis (sem depender só de cor) -->
        <div class="flex flex-wrap items-center gap-2 pt-1">
          <span class="text-xs text-[#a39e93] mr-1">Filtrar por estado:</span>

          <button
            type="button"
            (click)="activeStatusChip.set('all')"
            [class]="activeStatusChip() === 'all'
              ? 'px-3 py-1 rounded-full text-xs font-semibold bg-[#ff7a3d] text-[#101517]'
              : 'px-3 py-1 rounded-full text-xs bg-[#101517] text-[#a39e93] border border-[#2a3439] hover:text-[#e9e4d8]'"
          >
            Todos ({{ inventory.totalDevices() }})
          </button>

          <button
            type="button"
            (click)="activeStatusChip.set('unverified')"
            [class]="activeStatusChip() === 'unverified'
              ? 'px-3 py-1 rounded-full text-xs font-semibold bg-[#6c767a]/30 text-[#e9e4d8] border border-[#e9e4d8]'
              : 'px-3 py-1 rounded-full text-xs bg-[#101517] text-[#a39e93] border border-[#2a3439] hover:text-[#e9e4d8]'"
          >
            ◌ Sem verificação ({{ countByChip('unverified') }})
          </button>

          <button
            type="button"
            (click)="activeStatusChip.set('operational')"
            [class]="activeStatusChip() === 'operational'
              ? 'px-3 py-1 rounded-full text-xs font-semibold bg-[#4ca975]/25 text-[#75d49e] border border-[#4ca975]'
              : 'px-3 py-1 rounded-full text-xs bg-[#101517] text-[#a39e93] border border-[#2a3439] hover:text-[#e9e4d8]'"
          >
            ● Operacional ({{ countByChip('operational') }})
          </button>

          <button
            type="button"
            (click)="activeStatusChip.set('malfunction')"
            [class]="activeStatusChip() === 'malfunction'
              ? 'px-3 py-1 rounded-full text-xs font-semibold bg-[#d9534f]/25 text-[#f28b88] border border-[#d9534f]'
              : 'px-3 py-1 rounded-full text-xs bg-[#101517] text-[#a39e93] border border-[#2a3439] hover:text-[#e9e4d8]'"
          >
            ▲ Mau funcionamento ({{ countByChip('malfunction') }})
          </button>

          <button
            type="button"
            (click)="activeStatusChip.set('stolen')"
            [class]="activeStatusChip() === 'stolen'
              ? 'px-3 py-1 rounded-full text-xs font-semibold bg-[#8c6bb1]/30 text-[#cdb5e8] border border-[#8c6bb1]'
              : 'px-3 py-1 rounded-full text-xs bg-[#101517] text-[#a39e93] border border-[#2a3439] hover:text-[#e9e4d8]'"
          >
            ◆ Furtado ({{ countByChip('stolen') }})
          </button>

          <button
            type="button"
            (click)="activeStatusChip.set('immediate_urgency')"
            [class]="activeStatusChip() === 'immediate_urgency'
              ? 'px-3 py-1 rounded-full text-xs font-semibold bg-[#d99b38]/25 text-[#f0c271] border border-[#d99b38]'
              : 'px-3 py-1 rounded-full text-xs bg-[#101517] text-[#a39e93] border border-[#2a3439] hover:text-[#e9e4d8]'"
          >
            ! Urgência imediata ({{ countByChip('immediate_urgency') }})
          </button>
        </div>
      </section>

      <!-- ABA 1: LISTA DE EQUIPAMENTOS -->
      @if (activeEntityTab() === 'devices') {
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          @for (device of filteredDevices(); track device.id) {
            @let verified = story.isDeviceVerified(device.id);
            <article
              class="bg-[#1a2124] border rounded-xl p-5 flex flex-col justify-between transition-colors"
              [class]="!verified
                ? 'border-[#2a3439] opacity-90'
                : device.status === 'stolen'
                  ? 'border-[#8c6bb1]'
                  : device.status === 'malfunction' || device.maintenance.urgency === 'immediate'
                    ? 'border-[#d9534f]/80'
                    : 'border-[#2a3439]'"
            >
              <div>
                <div class="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="font-semibold text-base text-[#e9e4d8]">
                        {{ device.serialNumber }}
                      </span>
                      <span class="text-xs px-2 py-0.5 rounded bg-[#101517] text-[#a39e93] border border-[#2a3439]">
                        {{ getCategoryLabel(device.category) }}
                      </span>
                    </div>
                    <p class="text-sm text-[#a39e93] mt-0.5">
                      {{ device.brand }} · {{ device.model }}
                    </p>
                  </div>

                  <!-- Rótulo de status com ícone textual (não depende só de cor) -->
                  @if (!verified) {
                    <span class="px-2.5 py-1 text-xs font-medium rounded bg-[#101517] text-[#a39e93] border border-[#6c767a]/60">
                      ◌ Sem verificação
                    </span>
                  } @else {
                    <span
                      class="px-2.5 py-1 text-xs font-semibold rounded border"
                      [class]="getStatusBadgeClass(device.status)"
                    >
                      {{ getStatusLabelWithSymbol(device.status) }}
                    </span>
                  }
                </div>

                <!-- Endereço e Referência -->
                <div class="p-3 rounded-lg bg-[#101517] border border-[#2a3439] text-sm space-y-1 mb-3">
                  <div class="flex items-center justify-between text-[#e9e4d8]">
                    <span class="font-medium">{{ device.location.street }}</span>
                    <span class="text-xs text-[#a39e93]">CEP {{ device.location.cep }}</span>
                  </div>
                  <div class="text-xs text-[#a39e93]">
                    {{ device.location.neighborhood }} · Ref.: {{ device.location.reference }}
                  </div>
                </div>

                <!-- Especificações técnicas discriminadas por tipo -->
                <div class="mb-3">
                  @if (device.category === 'radar') {
                    <div class="flex flex-wrap gap-3 text-xs text-[#a39e93]">
                      <span>Limite: <strong class="text-[#e9e4d8]">{{ device.specs.speedLimitKmH }} km/h</strong></span>
                      <span>•</span>
                      <span>Faixas: <strong class="text-[#e9e4d8]">{{ device.specs.monitoredLanes }}</strong></span>
                      <span>•</span>
                      <span>Fiscalização: <strong class="text-[#e9e4d8]">{{ device.specs.enforcementType }}</strong></span>
                    </div>
                  } @else if (device.category === 'camera') {
                    <div class="flex flex-wrap gap-3 text-xs text-[#a39e93]">
                      <span>Resolução: <strong class="text-[#e9e4d8]">{{ device.specs.resolution }}</strong></span>
                      <span>•</span>
                      <span>Visão noturna: <strong class="text-[#e9e4d8]">{{ device.specs.nightVision ? 'Sim' : 'Não' }}</strong></span>
                      <span>•</span>
                      <span>Protocolo: <strong class="text-[#e9e4d8]">{{ device.specs.streamType }}</strong></span>
                      <span>•</span>
                      <span>PTZ: <strong class="text-[#e9e4d8]">{{ device.specs.ptz ? 'Móvel' : 'Fixa' }}</strong></span>
                    </div>
                  } @else {
                    <div class="flex flex-wrap gap-3 text-xs text-[#a39e93]">
                      @for (entry of getGenericSpecEntries(device); track entry.key) {
                        <span>{{ entry.key }}: <strong class="text-[#e9e4d8]">{{ entry.value }}</strong></span>
                      }
                    </div>
                  }
                </div>
              </div>

              <!-- Rodapé de Manutenção e Ações Diretas -->
              <div class="pt-3 border-t border-[#2a3439] space-y-2.5">
                @if (verified && device.maintenance.issueDescription) {
                  <p class="text-xs text-[#f28b88] bg-[#d9534f]/10 border border-[#d9534f]/30 rounded px-2.5 py-1.5">
                    Diagnóstico: {{ device.maintenance.issueDescription }}
                  </p>
                }

                <div class="flex flex-wrap items-center justify-between gap-2">
                  @if (!verified) {
                    <button
                      type="button"
                      (click)="verifyEquipment(device)"
                      class="px-4 py-2 rounded-lg bg-[#ff7a3d] hover:bg-[#ff8b55] text-[#101517] font-semibold text-xs transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#ff7a3d]"
                    >
                      Confirmar equipamento e setor
                    </button>
                  } @else {
                    <span class="text-xs text-[#4ca975] font-medium">
                      ✓ Equipamento verificado ({{ getUrgencyLabel(device.maintenance.urgency) }})
                    </span>
                  }

                  <div class="flex items-center gap-2">
                    @if (verified && device.status !== 'operational') {
                      <button
                        type="button"
                        (click)="normalizeDevice(device)"
                        class="px-3 py-1.5 rounded-lg bg-[#4ca975]/20 hover:bg-[#4ca975]/30 text-[#75d49e] border border-[#4ca975]/50 text-xs font-medium cursor-pointer"
                      >
                        Normalizar
                      </button>
                    }

                    <button
                      type="button"
                      (click)="inspectOnMap(device)"
                      class="px-3 py-1.5 rounded-lg bg-[#101517] hover:bg-[#232c30] text-[#e9e4d8] border border-[#2a3439] text-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <svg lucideIcon="map-pin" class="w-3.5 h-3.5 text-[#ff7a3d]"></svg>
                      Ver no mapa
                    </button>
                  </div>
                </div>
              </div>
            </article>
          } @empty {
            <div class="col-span-full bg-[#1a2124] border border-[#2a3439] rounded-xl p-10 text-center">
              <p class="text-sm text-[#e9e4d8]">
                Nenhum equipamento encontrado. Ajuste a busca ou os filtros.
              </p>
            </div>
          }
        </div>
      }

      <!-- ABA 2: AGENTES EM CAMPO -->
      @if (activeEntityTab() === 'agents') {
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          @for (agent of filteredAgents(); track agent.id) {
            <article class="bg-[#1a2124] border border-[#2a3439] rounded-xl p-4 space-y-3">
              <div class="flex items-start justify-between">
                <div>
                  <span class="text-xs text-[#a39e93]">{{ agent.badgeNumber }} · {{ agent.battalion }}</span>
                  <h3 class="text-base font-semibold text-[#e9e4d8] mt-0.5">{{ agent.name }}</h3>
                </div>
                <span class="px-2.5 py-0.5 text-xs rounded bg-[#101517] text-[#e9e4d8] border border-[#2a3439]">
                  {{ getAgentStatusLabel(agent.status) }}
                </span>
              </div>

              <div class="flex items-center justify-between text-xs text-[#a39e93] pt-2 border-t border-[#2a3439]">
                <span>{{ getAgentRoleLabel(agent.role) }} ({{ agent.mobilityType }})</span>
                <button
                  type="button"
                  (click)="inspectAgentOnMap(agent)"
                  class="text-[#ff7a3d] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <svg lucideIcon="locate-fixed" class="w-3.5 h-3.5"></svg>
                  Localizar no mapa
                </button>
              </div>
            </article>
          }
        </div>
      }

      <!-- Modal de Cadastro Dinâmico (<dialog closedby="any">) -->
      <dialog
        #deviceDialog
        closedby="any"
        aria-labelledby="dialogTitle"
        class="w-full max-w-2xl rounded-xl bg-[#1a2124] text-[#e9e4d8] border border-[#2a3439] shadow-2xl p-0 overflow-hidden"
      >
        <div class="p-5 border-b border-[#2a3439] bg-[#101517] flex items-center justify-between">
          <h2 id="dialogTitle" class="text-lg font-semibold text-[#e9e4d8]">
            Cadastrar novo equipamento
          </h2>
          <button
            type="button"
            (click)="closeRegistrationModal()"
            class="p-1.5 rounded-lg bg-[#1a2124] border border-[#2a3439] text-[#a39e93] hover:text-[#e9e4d8] cursor-pointer"
            aria-label="Fechar janela"
          >
            <svg lucideIcon="x" class="w-4 h-4"></svg>
          </button>
        </div>

        <form (ngSubmit)="submitNewDevice()" class="p-5 space-y-4 max-h-[80vh] overflow-y-auto text-sm">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="block text-[#e9e4d8] mb-1 font-medium">Categoria do equipamento</label>
              <select
                name="formCategory"
                [ngModel]="formCategory()"
                (ngModelChange)="formCategory.set($event)"
                class="w-full p-2.5 rounded-lg bg-[#101517] border border-[#2a3439] text-[#e9e4d8]"
              >
                <option value="radar">Radar de fiscalização</option>
                <option value="camera">Câmera de monitoramento</option>
                <option value="truck_scale">Balança dinâmica de caminhão</option>
                <option value="autonomous_patrol">Veículo autônomo de patrulha</option>
                <option value="automated_barrier">Cancela automatizada</option>
                <option value="transit_vehicle">Veículo de transporte / BRT</option>
                <option value="parking_totem">Totem de estacionamento</option>
                <option value="shared_micromobility">Estação de micromobilidade</option>
                <option value="police_vehicle">Viatura policial</option>
              </select>
            </div>

            <div>
              <label class="block text-[#e9e4d8] mb-1 font-medium">Estado operacional inicial</label>
              <select
                name="formStatus"
                [ngModel]="formStatus()"
                (ngModelChange)="formStatus.set($event)"
                class="w-full p-2.5 rounded-lg bg-[#101517] border border-[#2a3439] text-[#e9e4d8]"
              >
                <option value="operational">Operacional</option>
                <option value="not_installed">Ainda não instalado</option>
                <option value="maintenance">Em manutenção</option>
                <option value="malfunction">Mau funcionamento</option>
                <option value="disabled">Desativado</option>
                <option value="stolen">Furtado</option>
              </select>
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label class="block text-[#a39e93] mb-1">Número de série</label>
              <input
                type="text"
                name="formSerial"
                [(ngModel)]="formSerial"
                required
                class="w-full p-2 rounded-lg bg-[#101517] border border-[#2a3439] text-[#e9e4d8]"
              />
            </div>
            <div>
              <label class="block text-[#a39e93] mb-1">Fabricante</label>
              <input
                type="text"
                name="formBrand"
                [(ngModel)]="formBrand"
                required
                class="w-full p-2 rounded-lg bg-[#101517] border border-[#2a3439] text-[#e9e4d8]"
              />
            </div>
            <div>
              <label class="block text-[#a39e93] mb-1">Modelo</label>
              <input
                type="text"
                name="formModel"
                [(ngModel)]="formModel"
                required
                class="w-full p-2 rounded-lg bg-[#101517] border border-[#2a3439] text-[#e9e4d8]"
              />
            </div>
          </div>

          <div class="p-4 rounded-lg bg-[#101517] border border-[#2a3439] space-y-3">
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div class="sm:col-span-2">
                <label class="block text-[#a39e93] mb-1">Rua / Logradouro</label>
                <input
                  type="text"
                  name="formStreet"
                  [(ngModel)]="formStreet"
                  required
                  class="w-full p-2 rounded bg-[#1a2124] border border-[#2a3439] text-[#e9e4d8]"
                />
              </div>
              <div>
                <label class="block text-[#a39e93] mb-1">CEP</label>
                <input
                  type="text"
                  name="formCep"
                  [(ngModel)]="formCep"
                  required
                  class="w-full p-2 rounded bg-[#1a2124] border border-[#2a3439] text-[#e9e4d8]"
                />
              </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="block text-[#a39e93] mb-1">Bairro / Região</label>
                <select
                  name="formNeighborhood"
                  [(ngModel)]="formNeighborhood"
                  class="w-full p-2 rounded bg-[#1a2124] border border-[#2a3439] text-[#e9e4d8]"
                >
                  @for (neighborhood of neighborhoodsList(); track neighborhood) {
                    <option [value]="neighborhood">{{ neighborhood }}</option>
                  }
                </select>
              </div>
              <div>
                <label class="block text-[#a39e93] mb-1">Ponto de referência</label>
                <input
                  type="text"
                  name="formReference"
                  [(ngModel)]="formReference"
                  required
                  class="w-full p-2 rounded bg-[#1a2124] border border-[#2a3439] text-[#e9e4d8]"
                />
              </div>
            </div>
          </div>

          <!-- Campos específicos conforme a categoria selecionada -->
          <div class="p-4 rounded-lg bg-[#101517] border border-[#ff7a3d]/40 space-y-3">
            <div class="font-medium text-[#e9e4d8]">
              Parâmetros específicos — {{ getCategoryLabel(formCategory()) }}
            </div>

            @if (formCategory() === 'radar') {
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label class="block text-[#a39e93] mb-1">Velocidade limite (km/h)</label>
                  <input
                    type="number"
                    name="radarSpeedLimit"
                    [(ngModel)]="radarSpeedLimit"
                    class="w-full p-2 rounded bg-[#1a2124] border border-[#2a3439] text-[#e9e4d8]"
                  />
                </div>
                <div>
                  <label class="block text-[#a39e93] mb-1">Faixas monitoradas</label>
                  <input
                    type="number"
                    name="radarLanes"
                    [(ngModel)]="radarLanes"
                    class="w-full p-2 rounded bg-[#1a2124] border border-[#2a3439] text-[#e9e4d8]"
                  />
                </div>
                <div>
                  <label class="block text-[#a39e93] mb-1">Tipo de fiscalização</label>
                  <select
                    name="radarEnforcement"
                    [(ngModel)]="radarEnforcement"
                    class="w-full p-2 rounded bg-[#1a2124] border border-[#2a3439] text-[#e9e4d8]"
                  >
                    <option value="speed">Velocidade</option>
                    <option value="red_light">Avanço de semáforo</option>
                    <option value="turn">Conversão proibida</option>
                  </select>
                </div>
              </div>
            } @else if (formCategory() === 'camera') {
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label class="block text-[#a39e93] mb-1">Resolução</label>
                  <select
                    name="cameraResolution"
                    [(ngModel)]="cameraResolution"
                    class="w-full p-2 rounded bg-[#1a2124] border border-[#2a3439] text-[#e9e4d8]"
                  >
                    <option value="4k">4K</option>
                    <option value="1080p">1080p</option>
                  </select>
                </div>
                <div>
                  <label class="block text-[#a39e93] mb-1">Stream</label>
                  <select
                    name="cameraStream"
                    [(ngModel)]="cameraStream"
                    class="w-full p-2 rounded bg-[#1a2124] border border-[#2a3439] text-[#e9e4d8]"
                  >
                    <option value="rtsp">RTSP</option>
                    <option value="hls">HLS</option>
                  </select>
                </div>
                <label class="flex items-center gap-2 pt-5 cursor-pointer">
                  <input
                    type="checkbox"
                    name="cameraNightVision"
                    [(ngModel)]="cameraNightVision"
                    class="w-4 h-4"
                  />
                  <span>Visão noturna</span>
                </label>
                <label class="flex items-center gap-2 pt-5 cursor-pointer">
                  <input
                    type="checkbox"
                    name="cameraPtz"
                    [(ngModel)]="cameraPtz"
                    class="w-4 h-4"
                  />
                  <span>Domo PTZ</span>
                </label>
              </div>
            } @else {
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label class="block text-[#a39e93] mb-1">Parâmetro operacional</label>
                  <input
                    type="text"
                    name="genericSpecKey"
                    [(ngModel)]="genericSpecKey"
                    class="w-full p-2 rounded bg-[#1a2124] border border-[#2a3439] text-[#e9e4d8]"
                  />
                </div>
                <div>
                  <label class="block text-[#a39e93] mb-1">Valor de referência</label>
                  <input
                    type="text"
                    name="genericSpecValue"
                    [(ngModel)]="genericSpecValue"
                    class="w-full p-2 rounded bg-[#1a2124] border border-[#2a3439] text-[#e9e4d8]"
                  />
                </div>
              </div>
            }
          </div>

          <div class="flex items-center justify-end gap-3 pt-2 border-t border-[#2a3439]">
            <button
              type="button"
              (click)="closeRegistrationModal()"
              class="px-4 py-2 rounded-lg bg-[#101517] border border-[#2a3439] text-[#a39e93] hover:text-[#e9e4d8] cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              class="px-5 py-2 rounded-lg bg-[#ff7a3d] hover:bg-[#ff8b55] text-[#101517] font-semibold cursor-pointer"
            >
              Salvar equipamento
            </button>
          </div>
        </form>
      </dialog>
    </div>
  `,
})
export class InventoryComponent implements AfterViewInit {
  @ViewChild('deviceDialog', { static: true }) deviceDialog!: ElementRef<HTMLDialogElement>;
  @Output() navigateToMap = new EventEmitter<void>();

  readonly inventory = inject(DeviceInventoryService);
  readonly story = inject(StoryService);
  private readonly platformId = inject(PLATFORM_ID);

  readonly activeEntityTab = signal<'devices' | 'agents'>('devices');
  readonly searchQuery = signal<string>('');
  readonly selectedCategory = signal<DeviceCategory | 'all'>('all');
  readonly selectedNeighborhood = signal<string>('all');
  readonly activeStatusChip = signal<StatusChipFilter>('all');

  readonly formCategory = signal<DeviceCategory>('radar');
  readonly formStatus = signal<DeviceStatus>('operational');
  formSerial = 'RAD-510-0099';
  formBrand = 'Sensys Gatso';
  formModel = 'T-Series RT4 Doppler';
  formStreet = 'Av. Boa Viagem';
  formCep = '51020-000';
  formNeighborhood = 'Zona Sul - Boa Viagem';
  formReference = 'Em frente ao Nº 181';
  formLat = -8.1184;
  formLng = -34.9008;

  radarSpeedLimit = 60;
  radarLanes = 3;
  radarEnforcement: 'speed' | 'red_light' | 'turn' = 'speed';

  cameraResolution: '1080p' | '4k' = '4k';
  cameraStream: 'rtsp' | 'hls' = 'rtsp';
  cameraNightVision = true;
  cameraPtz = true;

  genericSpecKey = 'connectivityStatus';
  genericSpecValue = '5G Operacional';

  readonly neighborhoodsList = computed(() => {
    const unique = new Set(this.inventory.devices().map((d) => d.location.neighborhood));
    return Array.from(unique);
  });

  readonly filteredDevices = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    const category = this.selectedCategory();
    const neighborhood = this.selectedNeighborhood();
    const chip = this.activeStatusChip();

    return this.inventory.devices().filter((device) => {
      if (category !== 'all' && device.category !== category) return false;
      if (neighborhood !== 'all' && device.location.neighborhood !== neighborhood) return false;

      if (chip === 'unverified' && this.story.isDeviceVerified(device.id)) return false;
      if (chip === 'operational' && device.status !== 'operational') return false;
      if (chip === 'malfunction' && device.status !== 'malfunction') return false;
      if (chip === 'stolen' && device.status !== 'stolen') return false;
      if (chip === 'maintenance' && device.status !== 'maintenance') return false;
      if (chip === 'immediate_urgency' && device.maintenance.urgency !== 'immediate') return false;

      if (!query) return true;

      return (
        device.serialNumber.toLowerCase().includes(query) ||
        device.location.street.toLowerCase().includes(query) ||
        device.location.neighborhood.toLowerCase().includes(query) ||
        device.model.toLowerCase().includes(query) ||
        device.brand.toLowerCase().includes(query) ||
        device.location.reference.toLowerCase().includes(query)
      );
    });
  });

  readonly filteredAgents = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    if (!query) return this.inventory.agents();
    return this.inventory.agents().filter(
      (ag) =>
        ag.name.toLowerCase().includes(query) ||
        ag.badgeNumber.toLowerCase().includes(query) ||
        ag.battalion.toLowerCase().includes(query)
    );
  });

  ngAfterViewInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    const dialog = this.deviceDialog?.nativeElement;
    if (!dialog) return;

    if (!('closedBy' in HTMLDialogElement.prototype)) {
      dialog.addEventListener('click', (event: MouseEvent) => {
        if (event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        const isDialogContent =
          rect.top <= event.clientY &&
          event.clientY <= rect.top + rect.height &&
          rect.left <= event.clientX &&
          event.clientX <= rect.left + rect.width;
        if (isDialogContent) return;
        dialog.close();
      });
    }
  }

  verifyEquipment(device: CityDevice): void {
    this.story.verifyDeviceCluster(device.id);
  }

  normalizeDevice(device: CityDevice): void {
    this.inventory.updateDeviceStatus(
      device.id,
      'operational',
      'none',
      'Normalizado e verificado pelo operador.'
    );
    this.story.verifyDeviceCluster(device.id);
    this.story.recordAlertAction('normalize', device.serialNumber);
  }

  countByChip(chip: StatusChipFilter): number {
    const all = this.inventory.devices();
    switch (chip) {
      case 'unverified':
        return all.filter((d) => !this.story.isDeviceVerified(d.id)).length;
      case 'operational':
        return all.filter((d) => d.status === 'operational').length;
      case 'malfunction':
        return all.filter((d) => d.status === 'malfunction').length;
      case 'stolen':
        return all.filter((d) => d.status === 'stolen').length;
      case 'immediate_urgency':
        return all.filter((d) => d.maintenance.urgency === 'immediate').length;
      case 'maintenance':
        return all.filter((d) => d.status === 'maintenance').length;
      default:
        return all.length;
    }
  }

  openRegistrationModal(): void {
    const dialog = this.deviceDialog?.nativeElement;
    if (dialog && !dialog.open) {
      dialog.showModal();
    }
  }

  closeRegistrationModal(): void {
    const dialog = this.deviceDialog?.nativeElement;
    if (dialog && dialog.open) {
      dialog.close();
    }
  }

  submitNewDevice(): void {
    const category = this.formCategory();
    const status = this.formStatus();
    const urgency: MaintenanceUrgency =
      status === 'malfunction' || status === 'stolen' ? 'immediate' : 'none';
    const shortUuid = uuidv4().split('-')[0].toUpperCase();

    const base = {
      id: `DEV-${shortUuid}`,
      serialNumber: this.formSerial.trim() || `IOT-${shortUuid}`,
      brand: this.formBrand.trim() || 'Nexus Systems',
      model: this.formModel.trim() || 'Sentinel v4',
      location: {
        cep: this.formCep,
        street: this.formStreet,
        neighborhood: this.formNeighborhood,
        city: 'Recife',
        state: 'PE',
        reference: this.formReference,
        lat: Number(this.formLat),
        lng: Number(this.formLng),
      },
      status,
      maintenance: {
        urgency,
        lastServiceDate: 'Recém-cadastrado',
        nextScheduledDate: '2026-12-01',
      },
    };

    let createdDevice: CityDevice;

    if (category === 'radar') {
      const radar: RadarDevice = {
        ...base,
        category: 'radar',
        specs: {
          speedLimitKmH: Number(this.radarSpeedLimit),
          monitoredLanes: Number(this.radarLanes),
          enforcementType: this.radarEnforcement,
        },
      };
      createdDevice = radar;
    } else if (category === 'camera') {
      const camera: CameraDevice = {
        ...base,
        category: 'camera',
        specs: {
          resolution: this.cameraResolution,
          nightVision: this.cameraNightVision,
          streamType: this.cameraStream,
          ptz: this.cameraPtz,
        },
      };
      createdDevice = camera;
    } else {
      const generic: GenericIoTDevice = {
        ...base,
        category,
        specs: {
          [this.genericSpecKey]: this.genericSpecValue,
          homologatedByPrometheus: true,
        },
      };
      createdDevice = generic;
    }

    this.inventory.addDevice(createdDevice);
    this.story.verifyDeviceCluster(createdDevice.id);
    this.closeRegistrationModal();
  }

  inspectOnMap(device: CityDevice): void {
    this.story.verifyDeviceCluster(device.id);
    this.inventory.focusOnDevice(device.id, 16);
    this.navigateToMap.emit();
  }

  inspectAgentOnMap(agent: FieldAgent): void {
    this.inventory.focusOnCoordinates(agent.location.lat, agent.location.lng, 16);
    this.navigateToMap.emit();
  }

  getGenericSpecEntries(
    device: CityDevice
  ): { key: string; value: string | number | boolean }[] {
    if (device.category === 'radar' || device.category === 'camera') return [];
    return Object.entries(device.specs)
      .slice(0, 4)
      .map(([key, value]) => ({ key, value }));
  }

  getCategoryLabel(category: DeviceCategory): string {
    const labels: Record<DeviceCategory, string> = {
      radar: 'Radar de fiscalização',
      camera: 'Câmera de vídeo',
      truck_scale: 'Balança de caminhão',
      autonomous_patrol: 'Patrulha autônoma',
      automated_barrier: 'Cancela automática',
      transit_vehicle: 'Veículo de transporte',
      parking_totem: 'Totem rotativo',
      shared_micromobility: 'Micromobilidade',
      police_vehicle: 'Viatura policial',
    };
    return labels[category];
  }

  getStatusLabelWithSymbol(status: DeviceStatus): string {
    const labels: Record<DeviceStatus, string> = {
      operational: '● Operacional',
      malfunction: '▲ Mau funcionamento',
      maintenance: '◆ Em manutenção',
      stolen: '✖ Furtado',
      disabled: '○ Desativado',
      not_installed: '○ Não instalado',
    };
    return labels[status];
  }

  getStatusBadgeClass(status: DeviceStatus): string {
    switch (status) {
      case 'operational':
        return 'bg-[#4ca975]/20 text-[#75d49e] border-[#4ca975]/50';
      case 'malfunction':
        return 'bg-[#d9534f]/20 text-[#f28b88] border-[#d9534f]/50';
      case 'maintenance':
        return 'bg-[#d99b38]/20 text-[#f0c271] border-[#d99b38]/50';
      case 'stolen':
        return 'bg-[#8c6bb1]/25 text-[#cdb5e8] border-[#8c6bb1]/60';
      case 'disabled':
      case 'not_installed':
        return 'bg-[#101517] text-[#a39e93] border-[#2a3439]';
    }
  }

  getUrgencyLabel(urgency: MaintenanceUrgency): string {
    switch (urgency) {
      case 'immediate':
        return 'urgência imediata';
      case 'scheduled':
        return 'manutenção agendada';
      case 'none':
        return 'manutenção em dia';
    }
  }

  getAgentRoleLabel(role: FieldAgent['role']): string {
    switch (role) {
      case 'traffic_agent':
        return 'Agente de trânsito';
      case 'civil_guard':
        return 'Guarda municipal';
      case 'military_police':
        return 'Polícia militar';
    }
  }

  getAgentStatusLabel(status: FieldAgent['status']): string {
    switch (status) {
      case 'patrolling':
        return '● Em patrulha';
      case 'responding':
        return '▲ Em ocorrência';
      case 'break':
        return '○ Intervalo';
      case 'off_duty':
        return '○ Fora de turno';
    }
  }
}
