# -*- coding: utf-8 -*-
"""Cadastro da empresa (tela "Cadastro" do aplicativo) <-> clientes/<NOME>/config.json.

O cálculo continua lendo o config.json como sempre. A tela só traduz o arquivo para um formulário e de volta:
- empresa, rubricas, jornada, feriados e funcionários (código, férias, afastamento, rescisão, não controla ponto)
  gravam nas mesmas chaves que o gerar_folha.py já usa;
- CNPJ, dados da CCT e cargo/admissão/nome completo dos funcionários ficam em "cadastro" (só consulta, não entram no cálculo).
Cada salvamento guarda a versão anterior em clientes/<NOME>/_historico/.
"""
import datetime, json, os, re, shutil

import leitores

PASTA = os.path.dirname(os.path.abspath(__file__))
CLIENTES = os.path.join(PASTA, 'clientes')

RUBRICAS = [('HE70', 'Hora extra faixa 1 (70%)'), ('HE100', 'Hora extra faixa 2 (100%)'), ('NOT', 'Adicional noturno (horas)'),
            ('NOTRED', 'Redução da hora noturna (opcional)'), ('FALTA', 'Faltas em horas (parciais + dias inteiros)'),
            ('DSR', 'DSR perdido (horas)')]
CCT_CAMPOS = ['sindicato_laboral', 'sindicato_patronal', 'registro_mte', 'vigencia_ini', 'vigencia_fim', 'data_base', 'piso',
              'he_perc1', 'he_perc2', 'noturno_perc', 'banco_horas', 'obs']
FUNC_INFO = ['nome_completo', 'cargo', 'admissao']
R_HM = re.compile(r'^\d{1,3}:[0-5]\d$')
R_FERIADO = re.compile(r'^(\d{1,2}/\d{1,2}|\d{4}-\d{2}-\d{2})$')


def _arq(cliente): return os.path.join(CLIENTES, cliente, 'config.json')


def _txt(v): return str(v).strip() if v not in (None, '') else ''


# ------------------------------------------------------------------ config.json -> formulário
def ler(cliente):
    cfg = json.load(open(_arq(cliente), encoding='utf-8'))
    cad = cfg.get('cadastro') or {}
    info = cad.get('funcionarios') or {}
    chaves = []  # ordem: códigos, depois quem só aparece em outras listas
    for k in ('codigos', 'nao_controla', 'ferias', 'afastamentos', 'rescisoes', 'obs'):
        for n in (cfg.get(k) or {}):
            if n not in chaves: chaves.append(n)
    for n in info:
        if n not in chaves: chaves.append(n)
    funcs = []
    for n in chaves:
        fe = (cfg.get('ferias') or {}).get(n) or {}
        af = (cfg.get('afastamentos') or {}).get(n) or {}
        i = info.get(n) or {}
        nc = (cfg.get('nao_controla') or {}).get(n)
        funcs.append(dict(nome=n, codigo=(cfg.get('codigos') or {}).get(n), **{k: _txt(i.get(k)) for k in FUNC_INFO},
                          controla=not nc, motivo_nao_controla=_txt(nc),
                          ferias_ini=_txt(fe.get('inicio')), ferias_fim=_txt(fe.get('fim')), ferias_obs=_txt(fe.get('obs')),
                          afast_ini=_txt(af.get('inicio')), afast_fim=_txt(af.get('fim')), afast_tipo=_txt(af.get('tipo')),
                          afast_obs=_txt(af.get('obs')), rescisao=_txt((cfg.get('rescisoes') or {}).get(n)),
                          obs=_txt((cfg.get('obs') or {}).get(n))))
    rub = cfg.get('rubricas') or {}
    cnpj = _txt(cad.get('cnpj'))
    if not cnpj:  # cadastros antigos: CNPJ anotado no texto de origem do código da empresa
        m = re.search(r'\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2}', _txt(cfg.get('empresa_origem'))); cnpj = m[0] if m else ''
    return dict(
        cliente=cliente,
        empresa=dict(nome=_txt(cfg.get('empresa_nome')), cnpj=cnpj, codigo=cfg.get('empresa'),
                     origem=_txt(cfg.get('empresa_origem')), tipo_folha=cfg.get('tipo_folha', 11)),
        cct={k: _txt((cad.get('cct') or {}).get(k)) for k in CCT_CAMPOS},
        rubricas=[dict(chave=k, nome=n, codigo=rub.get(k)) for k, n in RUBRICAS],
        jornada=dict(jornada=_txt(cfg.get('jornada')), tolerancia=_txt(cfg.get('tolerancia')), he_lim=_txt(cfg.get('he_lim')),
                     horas_dia_falta=_txt(cfg.get('horas_dia_falta')), sab100=_txt(cfg.get('sab100')) or 'SIM',
                     interv_modo=cfg.get('interv_modo', 2)),
        feriados=[dict(data=k, nome=_txt(v)) for k, v in (cfg.get('feriados') or {}).items()],
        funcionarios=funcs)


# ------------------------------------------------------------------ formulário -> config.json
def _int(v, campo, obrig=False):
    if v in (None, ''):
        if obrig: raise ValueError(f'{campo}: obrigatório')
        return None
    try: return int(str(v).strip())
    except ValueError: raise ValueError(f'{campo}: use só números (recebido "{v}")')


def _hm(v, campo):
    v = _txt(v)
    if not R_HM.match(v): raise ValueError(f'{campo}: use horas:minutos, ex. 08:00 (recebido "{v}")')
    h, m = v.split(':'); return f'{int(h):02d}:{m}'


def _data(v, campo, obrig=False):
    v = _txt(v)
    if not v:
        if obrig: raise ValueError(f'{campo}: informe a data')
        return None
    try: return datetime.date.fromisoformat(v).isoformat()
    except ValueError: raise ValueError(f'{campo}: data inválida ("{v}")')


def montar(cfg, f):
    """Aplica o formulário f sobre o config atual (chaves que a tela não conhece ficam como estão)."""
    cfg = dict(cfg); e = f['empresa']; j = f['jornada']
    cfg['empresa_nome'] = _txt(e.get('nome')) or cfg.get('empresa_nome')
    cfg['empresa'] = _int(e.get('codigo'), 'Código da empresa no Domínio')
    cfg['empresa_origem'] = _txt(e.get('origem'))
    cfg['tipo_folha'] = _int(e.get('tipo_folha'), 'Tipo da folha') or 11
    cfg['rubricas'] = {r['chave']: _int(r.get('codigo'), f"Rubrica {r.get('nome') or r['chave']}") for r in f['rubricas']}
    cfg['jornada'] = _hm(j.get('jornada'), 'Jornada diária')
    cfg['tolerancia'] = _hm(j.get('tolerancia'), 'Tolerância')
    cfg['he_lim'] = _hm(j.get('he_lim'), 'Limite de horas extras a 70%')
    cfg['horas_dia_falta'] = _hm(j.get('horas_dia_falta'), 'Horas de 1 dia (falta/DSR)')
    cfg['sab100'] = 'SIM' if _txt(j.get('sab100')).upper() == 'SIM' else 'NÃO'
    cfg['interv_modo'] = 1 if str(j.get('interv_modo')) == '1' else 2
    fer = {}
    for x in f.get('feriados') or []:
        d, n = _txt(x.get('data')), _txt(x.get('nome'))
        if not d and not n: continue
        if not R_FERIADO.match(d): raise ValueError(f'Feriado "{n}": data deve ser DD/MM (todo ano) ou uma data específica')
        fer[d] = n or 'Feriado'
    cfg['feriados'] = fer
    cod, nc, ferias, afast, resc, obs, info, vistos = {}, {}, {}, {}, {}, {}, {}, set()
    for x in f.get('funcionarios') or []:
        n = re.sub(r'\s+', ' ', _txt(x.get('nome'))).upper()
        if not n: continue
        if leitores.norm(n) in vistos: raise ValueError(f'Funcionário "{n}" aparece duas vezes na lista')
        vistos.add(leitores.norm(n))
        c = _int(x.get('codigo'), f'{n}: código no Domínio')
        if c is not None: cod[n] = c
        if not x.get('controla', True): nc[n] = _txt(x.get('motivo_nao_controla')) or 'Não registra ponto.'
        fi, ff = _data(x.get('ferias_ini'), f'{n}: início das férias'), _data(x.get('ferias_fim'), f'{n}: fim das férias')
        if fi or ff:
            if not (fi and ff): raise ValueError(f'{n}: informe início e fim das férias')
            if ff < fi: raise ValueError(f'{n}: fim das férias antes do início')
            ferias[n] = dict(inicio=fi, fim=ff, **({'obs': _txt(x['ferias_obs'])} if _txt(x.get('ferias_obs')) else {}))
        ai = _data(x.get('afast_ini'), f'{n}: início do afastamento')
        af = _data(x.get('afast_fim'), f'{n}: fim do afastamento')
        if ai:
            if af and af < ai: raise ValueError(f'{n}: fim do afastamento antes do início')
            afast[n] = dict(inicio=ai, fim=af, tipo=_txt(x.get('afast_tipo')).upper() or 'AFASTAMENTO',
                            **({'obs': _txt(x['afast_obs'])} if _txt(x.get('afast_obs')) else {}))
        elif af: raise ValueError(f'{n}: informe o início do afastamento')
        r = _data(x.get('rescisao'), f'{n}: data da rescisão')
        if r: resc[n] = r
        if _txt(x.get('obs')): obs[n] = _txt(x['obs'])
        i = {k: _txt(x.get(k)) for k in FUNC_INFO if _txt(x.get(k))}
        if i.get('admissao'): i['admissao'] = _data(i['admissao'], f'{n}: data de admissão')
        if i: info[n] = i
    cfg.update(codigos=cod, nao_controla=nc, ferias=ferias, afastamentos=afast, rescisoes=resc, obs=obs)
    cct = {k: _txt((f.get('cct') or {}).get(k)) for k in CCT_CAMPOS}
    for k in ('vigencia_ini', 'vigencia_fim'): cct[k] = _data(cct[k], 'Vigência da CCT') or ''
    cfg['cadastro'] = dict(cnpj=_txt(e.get('cnpj')), cct={k: v for k, v in cct.items() if v}, funcionarios=info)
    return cfg


def salvar(cliente, f):
    arq = _arq(cliente)
    antigo = json.load(open(arq, encoding='utf-8'))
    novo = montar(antigo, f)
    hist = os.path.join(CLIENTES, cliente, '_historico'); os.makedirs(hist, exist_ok=True)
    shutil.copy2(arq, os.path.join(hist, f"config_{datetime.datetime.now():%Y-%m-%d_%H%M%S}.json"))
    tmp = arq + '.tmp'
    json.dump(novo, open(tmp, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    os.replace(tmp, arq)
    return ler(cliente)


def novo_cliente(nome):
    pasta = leitores.norm(nome).replace(' ', '_')
    pasta = re.sub(r'[^A-Z0-9_\-]', '', pasta)
    if not pasta: raise ValueError('informe o nome do cliente')
    dst = os.path.join(CLIENTES, pasta)
    if os.path.exists(dst): raise ValueError('esse cliente já existe')
    os.makedirs(dst)
    cfg = json.load(open(os.path.join(CLIENTES, '_MODELO', 'config.json'), encoding='utf-8'))
    cfg['empresa_nome'] = _txt(nome)
    json.dump(cfg, open(os.path.join(dst, 'config.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    return pasta
