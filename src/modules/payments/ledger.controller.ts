import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiCommonErrors } from '../../common/decorators/api-common-errors.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';
import { AuthUser } from '../../common/types/auth-user';
import { LedgerAccountResponseDto, LedgerEntryPageDto } from './dto/ledger.dto';
import { LedgerService } from './ledger.service';

@ApiTags('Grand livre')
@ApiBearerAuth()
@ApiCommonErrors()
@Controller('ledger')
@UseGuards(AuthGuard)
export class LedgerController {
  constructor(private readonly ledgerService: LedgerService) {}

  @Get('me')
  @ApiOperation({ summary: 'Lister mes comptes du grand livre' })
  @ApiOkResponse({ type: [LedgerAccountResponseDto] })
  accounts(@CurrentUser() user: AuthUser) {
    return this.ledgerService.getMyAccounts(user);
  }

  @Get('me/entries')
  @ApiOperation({ summary: 'Lister mes ecritures du grand livre' })
  @ApiOkResponse({ type: LedgerEntryPageDto })
  entries(@CurrentUser() user: AuthUser, @Query() query: PaginationQueryDto) {
    return this.ledgerService.getMyEntries(user, query);
  }
}
